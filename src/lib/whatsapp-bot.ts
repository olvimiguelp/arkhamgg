import { getLocalWebhookUrl, getLocalHealthUrl, getWebhookSecret } from "./webhook-dns-utils"

export interface WhatsappMessagePayload {
  id?: string
  name?: string
  phone: string
  message: string
  repairNumber?: string
}

export async function sendWhatsappBotMessage(payload: WhatsappMessagePayload): Promise<{
  success: boolean
  usedBot: boolean
  error?: string
}> {
  const cleanPhone = payload.phone.replace(/\D/g, "")
  if (!cleanPhone) {
    return { success: false, usedBot: false, error: "Sin número de teléfono válido" }
  }

  const ipcRenderer = typeof window !== "undefined" ? (window as any).require?.("electron")?.ipcRenderer : null

  // 1. Try Electron IPC (integrated WhatsApp Bot)
  if (ipcRenderer) {
    try {
      const status = await ipcRenderer.invoke("whatsapp:status").catch(() => null)
      if (status?.ready) {
        const res = await ipcRenderer.invoke("whatsapp:send", [
          {
            id: payload.id || `repair-${Date.now()}`,
            name: payload.name || "Cliente",
            phone: cleanPhone,
            message: payload.message,
          },
        ])

        const isOk = res?.results?.[0]?.ok || (res?.sentIds && res.sentIds.length > 0)
        if (isOk) {
          return { success: true, usedBot: true }
        }
      }
    } catch (err) {
      console.warn("[whatsapp-bot] Error enviando por IPC de WhatsApp:", err)
    }
  }

  // 2. Try Local Webhook / Web Service HTTP
  const webhookUrl = getLocalWebhookUrl()
  const healthUrl = getLocalHealthUrl(webhookUrl)
  const webhookSecret = getWebhookSecret()

  try {
    const health = await fetch(healthUrl, { method: "GET" })
      .then(async (r) => (r.ok ? r.json() : { ready: false }))
      .catch(() => ({ ready: false }))

    if (health?.ready !== false) {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          phone: cleanPhone,
          message: payload.message,
          name: payload.name,
          repairNumber: payload.repairNumber,
          customer: {
            name: payload.name,
            phone: cleanPhone,
          },
        }),
      })

      if (resp.ok) {
        return { success: true, usedBot: true }
      }
    }
  } catch (err) {
    console.warn("[whatsapp-bot] Error enviando por Webhook de WhatsApp:", err)
  }

  // 3. Fallback to direct wa.me link
  const encoded = encodeURIComponent(payload.message)
  window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, "_blank")
  return { success: true, usedBot: false }
}
