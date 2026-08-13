const path = require("path")
const dotenv = require("dotenv")
const { Client, LocalAuth } = require("whatsapp-web.js")
const qrcode = require("qrcode-terminal")
const { createClient } = require("@supabase/supabase-js")
const http = require("http")

dotenv.config({ path: path.join(__dirname, ".env") })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || ""
const DEFAULT_REMINDER_MESSAGE_TEMPLATE =
  "Hola {{name}}, buenos días.\n\nLe escribimos de 049Movil para informarle que tiene una deuda pendiente de {{debt}} con nosotros. Le solicitamos que pase por una de nuestras sucursales para saldarla o realizar un abono.\n\nGracias por su atención."
const REMINDER_MESSAGE_TEMPLATE =
  process.env.REMINDER_MESSAGE_TEMPLATE ||
  DEFAULT_REMINDER_MESSAGE_TEMPLATE
const REMINDER_POLL_SECONDS = Number.parseInt(process.env.REMINDER_POLL_SECONDS || "60", 10)
const REMINDER_DELAY_MS = Number.parseInt(process.env.REMINDER_DELAY_MS || "1200", 10)
const DRY_RUN = process.env.DRY_RUN === "true"
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || ""
const WEBHOOK_PORT = Number.parseInt(process.env.WEBHOOK_PORT || "3100", 10)
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/send"
const WEBHOOK_HEALTH_PATH = process.env.WEBHOOK_HEALTH_PATH || "/health"
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || "America/Santo_Domingo"
const AUTO_SEND_HOUR = Number.parseInt(process.env.REMINDER_AUTO_SEND_HOUR || "10", 10)
const AUTO_SEND_MINUTE = Number.parseInt(process.env.REMINDER_AUTO_SEND_MINUTE || "30", 10)
const DEFAULT_REMINDER_INTERVAL_DAYS = 15
const MAX_REMINDER_INTERVAL_DAYS = 30

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in whatsapp-bot/.env")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const runOnce = process.argv.includes("--once")
let isRunning = false
let isClientReady = false
let qrCode = null
let lastError = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getZonedDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  const parts = {}
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

function getDateKeyInTimeZone(date) {
  const parts = getZonedDateParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function getDaysBetweenDateKeys(startKey, endKey) {
  const start = Date.parse(`${startKey}T00:00:00Z`)
  const end = Date.parse(`${endKey}T00:00:00Z`)
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

function normalizeReminderIntervalDays(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_REMINDER_INTERVAL_DAYS), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_INTERVAL_DAYS
  return Math.min(MAX_REMINDER_INTERVAL_DAYS, Math.max(1, parsed))
}

function isAfterAutomaticSendTime(date = new Date()) {
  const parts = getZonedDateParts(date)
  return parts.hour > AUTO_SEND_HOUR || (parts.hour === AUTO_SEND_HOUR && parts.minute >= AUTO_SEND_MINUTE)
}

function getReminderDaysSinceLastSent(lastSentAt, now = new Date()) {
  if (!lastSentAt) return Number.POSITIVE_INFINITY
  const last = new Date(lastSentAt)
  if (Number.isNaN(last.getTime())) return Number.POSITIVE_INFINITY
  return getDaysBetweenDateKeys(getDateKeyInTimeZone(last), getDateKeyInTimeZone(now))
}

function formatDebt(value) {
  const num = Number(value || 0)
  if (Number.isNaN(num)) return "0"
  return num.toFixed(2)
}

function buildMessage(customer) {
  const template =
    typeof customer?.reminder_message === "string" && customer.reminder_message.trim().length > 0
      ? customer.reminder_message
      : REMINDER_MESSAGE_TEMPLATE
  return template
    .replaceAll("{{name}}", customer.name || "Cliente")
    .replaceAll("{{debt}}", formatDebt(customer.debt))
    .replaceAll("{{phone}}", customer.phone || "")
}

function normalizePhone(raw) {
  if (!raw) return ""
  let digits = raw.replace(/[^\d]/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "")
  if (DEFAULT_COUNTRY_CODE && digits.length <= 10) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`
  }
  return digits
}

function isDue(lastSentAt, intervalDays, now = new Date()) {
  if (!isAfterAutomaticSendTime(now)) return false
  return getReminderDaysSinceLastSent(lastSentAt, now) >= normalizeReminderIntervalDays(intervalDays)
}

async function fetchDueCustomers() {
  const now = new Date()
  if (!isAfterAutomaticSendTime(now)) {
    return []
  }

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, debt, reminder_interval_days, reminder_last_sent_at, reminder_enabled, reminder_message",
    )
    .eq("reminder_enabled", true)
    .gt("debt", 0)

  if (error) {
    console.error("Fetch customers error:", error)
    return []
  }

  return (data || []).filter((customer) => {
    return isDue(customer.reminder_last_sent_at, customer.reminder_interval_days, now)
  })
}

async function sendReminder(client, customer) {
  const normalized = normalizePhone(customer.phone)
  if (!normalized) {
    return { ok: false, reason: "missing_phone" }
  }

  const numberId = await client.getNumberId(normalized)
  if (!numberId) {
    return { ok: false, reason: "not_on_whatsapp", normalized }
  }

  const chatId = numberId._serialized || `${normalized}@c.us`
  const message = buildMessage(customer)

  if (DRY_RUN) {
    console.log("[DRY_RUN]", chatId, message)
    return { ok: true }
  }

  await client.sendMessage(chatId, message)
  return { ok: true }
}

async function sendRawMessage(client, phone, message) {
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return { ok: false, reason: "missing_phone" }
  }

  const numberId = await client.getNumberId(normalized)
  if (!numberId) {
    return { ok: false, reason: "not_on_whatsapp", normalized }
  }

  const chatId = numberId._serialized || `${normalized}@c.us`

  if (DRY_RUN) {
    console.log("[DRY_RUN]", chatId, message)
    return { ok: true }
  }

  await client.sendMessage(chatId, message)
  return { ok: true }
}

async function processOnce(client) {
  if (isRunning) return
  isRunning = true

  try {
    const due = await fetchDueCustomers()
    if (due.length === 0) {
      console.log("No reminders due.")
      return
    }

    console.log(`Processing ${due.length} reminders...`)

    const sentIds = []
    for (const customer of due) {
      try {
        const result = await sendReminder(client, customer)
        if (result.ok) {
          sentIds.push(customer.id)
        } else {
          if (result.reason === "not_on_whatsapp") {
            console.warn("Skipped:", customer.id, result.reason, result.normalized || "")
          } else {
            console.warn("Skipped:", customer.id, result.reason)
          }
        }
      } catch (error) {
        console.error("Send failed:", customer.id, error?.message || error)
      }

      if (REMINDER_DELAY_MS > 0) {
        await sleep(REMINDER_DELAY_MS)
      }
    }

    if (sentIds.length > 0) {
      const { error } = await supabase
        .from("customers")
        .update({ reminder_last_sent_at: new Date().toISOString() })
        .in("id", sentIds)

      if (error) {
        console.error("Update last_sent error:", error)
      }
    }
  } finally {
    isRunning = false
  }
}

function killOrphanedChromeProcesses() {
  if (process.platform !== "win32") return
  try {
    const { execSync } = require("child_process")
    const command = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`
    execSync(command, { stdio: "ignore" })
    console.log("Stale chrome processes killed")
  } catch (error) {
    console.error("Error killing stale chrome processes:", error)
  }
}

killOrphanedChromeProcesses()

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, ".wwebjs_auth") }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(CHROME_EXECUTABLE_PATH ? { executablePath: CHROME_EXECUTABLE_PATH } : {}),
  },
})

client.on("qr", (qr) => {
  console.log("Scan QR to login:")
  qrcode.generate(qr, { small: true })
  qrCode = qr
  isClientReady = false
  lastError = null
})

client.on("ready", async () => {
  console.log("WhatsApp client ready.")
  isClientReady = true
  qrCode = null
  lastError = null

  await processOnce(client)

  if (runOnce) {
    await client.destroy()
    process.exit(0)
  }

  setInterval(() => {
    processOnce(client)
  }, REMINDER_POLL_SECONDS * 1000)
})

client.on("auth_failure", (message) => {
  console.error("Auth failure:", message)
  isClientReady = false
  qrCode = null
  lastError = message
})

client.on("disconnected", (reason) => {
  console.error("Disconnected:", reason)
  isClientReady = false
  qrCode = null
  lastError = reason
})

client.initialize().catch((err) => {
  console.error("Initialization error:", err)
  lastError = err?.message || String(err)
})

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(error)
      }
    })
  })
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function writeJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url || "/", "http://localhost")

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  if (req.method === "GET" && pathname === WEBHOOK_HEALTH_PATH) {
    writeJson(res, 200, { ok: true, ready: isClientReady, qr: qrCode, error: lastError })
    return
  }

  if (req.method !== "POST" || pathname !== WEBHOOK_PATH) {
    writeJson(res, 404, { ok: false, error: "not_found" })
    return
  }

  if (WEBHOOK_SECRET) {
    const provided = req.headers["x-webhook-secret"]
    if (provided !== WEBHOOK_SECRET) {
      writeJson(res, 401, { ok: false, error: "unauthorized" })
      return
    }
  }

  if (!isClientReady) {
    writeJson(res, 503, { ok: false, error: "whatsapp_not_ready" })
    return
  }

  let body = {}
  try {
    body = await readJsonBody(req)
  } catch (error) {
    writeJson(res, 400, { ok: false, error: "invalid_json" })
    return
  }

  const phone = body.phone || body?.customer?.phone
  const customer = body.customer || { name: body.name, debt: body.debt, phone }
  const message = body.message || buildMessage(customer)

  try {
    const result = await sendRawMessage(client, phone, message)
    writeJson(res, result.ok ? 200 : 400, result)
  } catch (error) {
    console.error("Webhook send failed:", error?.message || error)
    writeJson(res, 500, { ok: false, error: "send_failed" })
  }
})

server.listen(WEBHOOK_PORT, () => {
  console.log(`Webhook server listening on http://localhost:${WEBHOOK_PORT}${WEBHOOK_PATH}`)
})

process.on("SIGINT", async () => {
  console.log("Shutting down...")
  try {
    await client.destroy()
  } finally {
    process.exit(0)
  }
})
