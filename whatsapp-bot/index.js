const path = require("path")
const dotenv = require("dotenv")
const wppconnect = require("@wppconnect-team/wppconnect")
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
const WHATSAPP_SEND_INTERVAL_MS = Number.parseInt(
  process.env.WHATSAPP_SEND_INTERVAL_MS || String(4 * 60 * 1000),
  10,
)
const MAX_SEND_ATTEMPTS = 2
const SEND_RETRY_DELAY_MS = 1000
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
let client = null
let isClientReady = false
let isClientConnecting = false
let isClientSyncing = false
let loadingProgress = null
let qrCode = null
let lastError = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let whatsappSendQueue = Promise.resolve()
let lastWhatsAppSendAt = 0

function sendWhatsAppMessage(client, chatId, message) {
  const send = whatsappSendQueue.then(async () => {
    const remaining = WHATSAPP_SEND_INTERVAL_MS - (Date.now() - lastWhatsAppSendAt)
    if (lastWhatsAppSendAt > 0 && remaining > 0) await sleep(remaining)
    try {
      return await client.sendText(chatId, message)
    } finally {
      lastWhatsAppSendAt = Date.now()
    }
  })
  whatsappSendQueue = send.catch(() => {})
  return send
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

async function sendToPhone(client, phone, message) {
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return { ok: false, reason: "missing_phone" }
  }

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      const chatId = `${normalized}@c.us`
      const numberStatus = await client.checkNumberStatus(chatId)
      if (!numberStatus?.numberExists) {
        return { ok: false, reason: "not_on_whatsapp", normalized }
      }

      if (DRY_RUN) {
        console.log("[DRY_RUN]", chatId, message)
        return { ok: true, attempts: attempt }
      }

      await sendWhatsAppMessage(client, chatId, message)
      return { ok: true, attempts: attempt }
    } catch (error) {
      if (attempt === MAX_SEND_ATTEMPTS) {
        return {
          ok: false,
          reason: "send_failed",
          attempts: attempt,
          error: error?.message || String(error),
        }
      }

      console.warn(`Send attempt ${attempt}/${MAX_SEND_ATTEMPTS} failed; retrying:`, error?.message || error)
      await sleep(SEND_RETRY_DELAY_MS)
    }
  }

  return { ok: false, reason: "send_failed", attempts: MAX_SEND_ATTEMPTS }
}

async function sendReminder(client, customer) {
  return sendToPhone(client, customer.phone, buildMessage(customer))
}

async function sendRawMessage(client, phone, message) {
  return sendToPhone(client, phone, message)
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
    let skippedCount = 0
    for (const customer of due) {
      try {
        const result = await sendReminder(client, customer)
        if (!result.ok) {
          skippedCount += 1
          if (result.reason === "not_on_whatsapp") {
            console.warn("Skipped:", customer.id, result.reason, result.normalized || "", "- continuing to next customer")
          } else if (result.reason === "send_failed") {
            console.warn("Skipped:", customer.id, result.reason, `after ${result.attempts} attempts`, result.error || "", "- continuing to next customer")
          } else {
            console.warn(
              "Skipped:",
              customer.id,
              result.reason,
              "- add a phone number to this customer in ARKHAM before sending",
            )
          }
          continue
        }

        sentIds.push(customer.id)
      } catch (error) {
        skippedCount += 1
        console.error("Send failed:", customer.id, error?.message || error, "- continuing to next customer")
        continue
      }
    }

    console.log(`Reminder batch finished: ${sentIds.length} sent, ${skippedCount} skipped.`)

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

let shuttingDown = false
let reconnectTimer = null
let reconnectAttempt = 0
let clientGeneration = 0
let reminderInterval = null

function scheduleReconnect(reason, generation = clientGeneration) {
  if (generation !== clientGeneration || reconnectTimer || shuttingDown || runOnce) return
  isClientReady = false
  isClientConnecting = false
  isClientSyncing = false
  loadingProgress = null
  qrCode = null
  lastError = reason || "connection lost"
  const delay = Math.min(5000 * 2 ** reconnectAttempt++, 60000)
  console.error(`WhatsApp reconnecting in ${Math.round(delay / 1000)}s:`, lastError)
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    if (generation !== clientGeneration) return
    clientGeneration += 1
    const oldClient = client
    client = null
    if (oldClient) await oldClient.close().catch(() => {})
    startWhatsAppClient()
  }, delay)
}

async function startWhatsAppClient() {
  if (client || isClientConnecting || shuttingDown) return
  const generation = ++clientGeneration
  isClientConnecting = true
  isClientSyncing = false
  lastError = null
  try {
    client = await wppconnect.create({
      session: "arkham-reminder-bot",
      headless: true,
      useChrome: true,
      logQR: false,
      updatesLog: false,
      disableWelcome: true,
      autoClose: 0,
      deviceSyncTimeout: 0,
      injectionTimeout: 120_000,
      waitForLogin: false,
      catchQR: (qrImage, asciiQR, attempt) => {
        if (shuttingDown || generation !== clientGeneration) return
        console.log("WhatsApp QR callback received:", Boolean(qrImage), qrImage?.length || 0, "attempt", attempt)
        if (process.stdout.isTTY) {
          console.log(`Scan QR to login (attempt ${attempt}):`)
          console.log(asciiQR)
        }
        qrCode = qrImage
        isClientConnecting = false
        isClientSyncing = false
        loadingProgress = null
        lastError = null
      },
      statusFind: (status) => {
        if (generation !== clientGeneration) return
        console.log("WhatsApp session status:", status)
        if (["qrReadSuccess", "isLogged", "inChat"].includes(status)) {
          qrCode = null
          isClientConnecting = false
          isClientSyncing = true
        } else if (["disconnectedMobile", "browserClose", "serverClose"].includes(status)) {
          scheduleReconnect(status, generation)
        }
      },
      onLoadingScreen: (percent, message) => {
        if (generation !== clientGeneration) return
        const parsedPercent = Number(percent)
        if (Number.isFinite(parsedPercent)) loadingProgress = Math.min(100, Math.max(0, parsedPercent))
        isClientConnecting = false
        isClientSyncing = true
        if (message) console.log("WhatsApp loading:", message)
      },
      folderNameToken: path.join(__dirname, ".wppconnect", "tokens"),
      puppeteerOptions: {
        headless: true,
        protocolTimeout: 300_000,
        userDataDir: path.join(__dirname, ".wppconnect", "session"),
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        ...(CHROME_EXECUTABLE_PATH ? { executablePath: CHROME_EXECUTABLE_PATH } : {}),
      },
    })
    if (generation !== clientGeneration || shuttingDown) {
      await client.close().catch(() => {})
      client = null
      return
    }
    client.onStateChange((state) => {
      if (generation !== clientGeneration) return
      console.log("WhatsApp connection state:", state)
      if (isClientReady && state !== "CONNECTED") scheduleReconnect(state, generation)
    })
    isClientConnecting = false
    isClientSyncing = true
    client.waitForLogin().then(async () => {
      if (shuttingDown || generation !== clientGeneration) return
      console.log("WhatsApp client ready.")
      reconnectAttempt = 0
      isClientReady = true
      isClientConnecting = false
      isClientSyncing = false
      loadingProgress = null
      qrCode = null
      lastError = null

      await processOnce(client)
      if (runOnce) {
        shuttingDown = true
        await client.close()
        process.exit(0)
      }
      if (!reminderInterval) {
        reminderInterval = setInterval(() => processOnce(client), REMINDER_POLL_SECONDS * 1000)
      }
    }).catch((error) => {
      if (!shuttingDown && generation === clientGeneration) {
        scheduleReconnect(error?.message || String(error), generation)
      }
    })
  } catch (error) {
    if (generation !== clientGeneration) return
    isClientConnecting = false
    isClientSyncing = false
    lastError = error?.message || String(error)
    console.error("Initialization error:", lastError)
    scheduleReconnect(lastError, generation)
  }
}

startWhatsAppClient()

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
    writeJson(res, 200, {
      ok: true,
      ready: isClientReady,
      connecting: isClientConnecting,
      qr: qrCode,
      syncing: isClientSyncing,
      progress: loadingProgress,
      error: lastError,
    })
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
