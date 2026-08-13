import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0"

type CustomerReminder = {
  id: string
  name: string
  phone: string | null
  debt: number | string | null
  reminder_interval_days: number | null
  reminder_last_sent_at: string | null
  reminder_enabled: boolean | null
  manual_message?: string | null
  reminder_message?: string | null
}

type SendResult = { ok: boolean; error?: string }

type ManualTarget = {
  id?: string
  name?: string
  phone?: string | null
  debt?: number | string | null
  message?: string | null
}

type TemplateParamKey = "name" | "debt" | "phone"

type WhatsAppTextPayload = {
  messaging_product: "whatsapp"
  to: string
  type: "text"
  text: { body: string }
}

type WhatsAppTemplatePayload = {
  messaging_product: "whatsapp"
  to: string
  type: "template"
  template: {
    name: string
    language: { code: string }
    components?: Array<{
      type: "body"
      parameters: Array<{ type: "text"; text: string }>
    }>
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const reminderSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? ""
const webhookUrl = Deno.env.get("REMINDER_WEBHOOK_URL") ?? ""
const webhookSecret = Deno.env.get("REMINDER_WEBHOOK_SECRET") ?? ""

const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? ""
const whatsappAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? ""
const whatsappApiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0"
const whatsappTemplateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? ""
const whatsappTemplateLang = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "es"
const whatsappTemplateParamKeys = Deno.env.get("WHATSAPP_TEMPLATE_PARAM_KEYS") ?? "name,debt"
const whatsappDefaultCountryCode = Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE") ?? ""
const SEND_DELAY_MS = 2 * 60 * 1000
const MANUAL_SEND_DELAY_MS = Number(Deno.env.get("MANUAL_SEND_DELAY_MS") ?? "0")
const REMINDER_TIMEZONE = Deno.env.get("REMINDER_TIMEZONE") ?? "America/Santo_Domingo"
const AUTO_SEND_HOUR = Number(Deno.env.get("REMINDER_AUTO_SEND_HOUR") ?? "10")
const AUTO_SEND_MINUTE = Number(Deno.env.get("REMINDER_AUTO_SEND_MINUTE") ?? "30")
const DEFAULT_REMINDER_INTERVAL_DAYS = 15
const MAX_REMINDER_INTERVAL_DAYS = 30
const DEFAULT_REMINDER_MESSAGE_TEMPLATE =
  "Hola {{name}}, buenos días.\n\nLe escribimos de ARKHAM para informarle que tiene una deuda pendiente de {{debt}} con nosotros. Le solicitamos que pase por una de nuestras sucursales para saldarla o realizar un abono.\n\nGracias por su atención."

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reminder-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function getZonedDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function getDateKeyInTimeZone(date: Date) {
  const parts = getZonedDateParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function getDaysBetweenDateKeys(startKey: string, endKey: string) {
  const start = Date.parse(`${startKey}T00:00:00Z`)
  const end = Date.parse(`${endKey}T00:00:00Z`)
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

function normalizeReminderIntervalDays(value?: number | string | null) {
  const parsed = Number(value ?? DEFAULT_REMINDER_INTERVAL_DAYS)
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_INTERVAL_DAYS
  return Math.min(MAX_REMINDER_INTERVAL_DAYS, Math.max(1, Math.round(parsed)))
}

function isAfterAutomaticSendTime(date = new Date()) {
  const parts = getZonedDateParts(date)
  return parts.hour > AUTO_SEND_HOUR || (parts.hour === AUTO_SEND_HOUR && parts.minute >= AUTO_SEND_MINUTE)
}

function getReminderDaysSinceLastSent(lastSentAt: string | null, now: Date) {
  if (!lastSentAt) return Number.POSITIVE_INFINITY
  const last = new Date(lastSentAt)
  if (Number.isNaN(last.getTime())) return Number.POSITIVE_INFINITY
  return getDaysBetweenDateKeys(getDateKeyInTimeZone(last), getDateKeyInTimeZone(now))
}

function isDue(lastSentAt: string | null, intervalDays: number | null, now: Date) {
  if (!isAfterAutomaticSendTime(now)) return false
  return getReminderDaysSinceLastSent(lastSentAt, now) >= normalizeReminderIntervalDays(intervalDays)
}

function formatDebt(value: number | string | null) {
  const num = Number(value ?? 0)
  if (Number.isNaN(num)) return "0"
  return num.toFixed(2)
}

function buildMessage(customer: CustomerReminder) {
  const template =
    (customer.manual_message ?? "").trim() ||
    (customer.reminder_message ?? "").trim() ||
    Deno.env.get("REMINDER_MESSAGE_TEMPLATE") ||
    DEFAULT_REMINDER_MESSAGE_TEMPLATE
  return template
    .replaceAll("{{name}}", customer.name ?? "Cliente")
    .replaceAll("{{debt}}", formatDebt(customer.debt))
    .replaceAll("{{phone}}", customer.phone ?? "")
}

function normalizePhone(raw: string | null) {
  if (!raw) return ""
  const cleaned = raw.replace(/[^\d+]/g, "")
  if (cleaned.startsWith("+")) return cleaned
  if (whatsappDefaultCountryCode) {
    return `+${whatsappDefaultCountryCode}${cleaned}`
  }
  return cleaned
}

function parseTemplateParamKeys(): TemplateParamKey[] {
  return whatsappTemplateParamKeys
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
    .map((key) => key as TemplateParamKey)
}

function mapTemplateParamValue(customer: CustomerReminder, key: TemplateParamKey) {
  if (key === "name") return customer.name ?? "Cliente"
  if (key === "debt") return formatDebt(customer.debt)
  if (key === "phone") return customer.phone ?? ""
  return ""
}

function buildTemplateParameters(customer: CustomerReminder) {
  const keys = parseTemplateParamKeys()
  if (keys.length === 0) return []
  return keys.map((key) => ({ type: "text", text: mapTemplateParamValue(customer, key) }))
}

function buildWhatsAppPayload(
  customer: CustomerReminder,
  to: string,
): WhatsAppTextPayload | WhatsAppTemplatePayload {
  if ((customer.manual_message ?? "").trim()) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: buildMessage(customer) },
    }
  }

  if (whatsappTemplateName) {
    const parameters = buildTemplateParameters(customer)
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: whatsappTemplateName,
        language: { code: whatsappTemplateLang },
        components: parameters.length
          ? [
              {
                type: "body",
                parameters,
              },
            ]
          : undefined,
      },
    }
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: buildMessage(customer) },
  }
}

async function sendViaWhatsAppCloud(customer: CustomerReminder): Promise<SendResult> {
  if (!whatsappPhoneNumberId || !whatsappAccessToken) {
    return { ok: false, error: "WHATSAPP_* env vars not set" }
  }

  if (!whatsappTemplateName) {
    return {
      ok: false,
      error: "WHATSAPP_TEMPLATE_NAME is required for scheduled reminders",
    }
  }

  const to = normalizePhone(customer.phone)
  if (!to) return { ok: false, error: "Customer phone missing" }

  const url = `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`
  const payload = buildWhatsAppPayload(customer, to)

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${whatsappAccessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false, error: `WhatsApp error ${res.status}: ${body}` }
  }

  return { ok: true }
}

async function sendViaWebhook(customer: CustomerReminder, message: string): Promise<SendResult> {
  if (!webhookUrl) return { ok: false, error: "REMINDER_WEBHOOK_URL not set" }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (webhookSecret) {
    headers["x-webhook-secret"] = webhookSecret
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone: customer.phone,
      message,
      customer: {
        id: customer.id,
        name: customer.name,
        debt: customer.debt,
      },
    }),
  })

  if (!res.ok) {
    return { ok: false, error: `Webhook error: ${res.status}` }
  }

  return { ok: true }
}

function resolveDeliveryMode() {
  if (whatsappPhoneNumberId && whatsappAccessToken) return "whatsapp"
  if (webhookUrl) return "webhook"
  return "none"
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  let body: any = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const rawTargets = Array.isArray(body?.targets) ? (body.targets as ManualTarget[]) : null
  const isManual = Boolean(rawTargets && rawTargets.length > 0)

  if (reminderSecret) {
    const token = req.headers.get("x-reminder-secret")
    if (token !== reminderSecret && !isManual) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })
    }
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response("Missing Supabase env vars", { status: 500, headers: corsHeaders })
  }

  const deliveryMode = resolveDeliveryMode()
  if (deliveryMode === "none") {
    return new Response("Missing delivery configuration", { status: 500, headers: corsHeaders })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })

  let customers: CustomerReminder[] = []
  if (isManual && rawTargets) {
    customers = rawTargets.map((target) => ({
      id: target.id ?? "",
      name: target.name ?? "Cliente",
      phone: target.phone ?? null,
      debt: target.debt ?? 0,
      reminder_interval_days: null,
      reminder_last_sent_at: null,
      reminder_enabled: true,
      manual_message: target.message ?? null,
      reminder_message: target.message ?? null,
    }))
  } else {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, name, phone, debt, reminder_interval_days, reminder_last_sent_at, reminder_enabled, reminder_message",
      )
      .eq("reminder_enabled", true)
      .gt("debt", 0)

    if (error) {
      console.error("Fetch customers error:", error)
      return new Response("Fetch customers failed", { status: 500, headers: corsHeaders })
    }

    customers = (data ?? []) as CustomerReminder[]
  }

  const now = new Date()
  const due = isManual
    ? customers
    : customers.filter((customer) => {
        const intervalDays = Number(customer.reminder_interval_days ?? 15)
        return isDue(customer.reminder_last_sent_at, intervalDays, now)
      })

  const sendable = due.filter((customer) => Boolean(customer.phone))
  let sent = 0
  let skippedNoPhone = due.length - sendable.length
  let failed = 0
  const sentIds: string[] = []
  const results: Array<{ id: string; ok: boolean; reason?: string; error?: string }> = []

  for (let index = 0; index < sendable.length; index += 1) {
    const customer = sendable[index]
    const message = buildMessage(customer)
    const result =
      deliveryMode === "whatsapp"
        ? await sendViaWhatsAppCloud(customer)
        : await sendViaWebhook(customer, message)

    if (result.ok) {
      sent += 1
      sentIds.push(customer.id)
      results.push({ id: customer.id, ok: true })
    } else {
      failed += 1
      console.error("Send failed:", { id: customer.id, error: result.error })
      results.push({ id: customer.id, ok: false, reason: "send_failed", error: result.error })
    }

    if (index < sendable.length - 1) {
      const delay = isManual ? MANUAL_SEND_DELAY_MS : SEND_DELAY_MS
      if (delay > 0) {
        await sleep(delay)
      }
    }
  }

  if (skippedNoPhone > 0) {
    due
      .filter((customer) => !customer.phone)
      .forEach((customer) => results.push({ id: customer.id, ok: false, reason: "missing_phone" }))
  }

  const persistedSentIds = sentIds.filter((id) => id && id.length > 0)
  if (persistedSentIds.length > 0) {
    const { error: updateError } = await supabase
      .from("customers")
      .update({ reminder_last_sent_at: now.toISOString() })
      .in("id", persistedSentIds)

    if (updateError) {
      console.error("Update last_sent error:", updateError)
    }
  }

  return new Response(
    JSON.stringify({
      checked: customers.length,
      due: due.length,
      sent,
      skippedNoPhone,
      failed,
      deliveryMode,
      sentIds,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
