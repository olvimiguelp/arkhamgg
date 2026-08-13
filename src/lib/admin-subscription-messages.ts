import { createClient } from "@/lib/supabase/client"
import { buildDefaultUpdateContent } from "@/lib/app-version"

export type AdminMessageType =
  | "general"
  | "vencimiento"
  | "renovacion"
  | "bloqueo"
  | "actualizacion"

export type AdminMessageScope = "all" | "specific"

export type AdminSubscriptionMessage = {
  id: string
  message_type: AdminMessageType
  content: string
  scope: AdminMessageScope
  recipient_admin_ids: string[]
  recipient_count: number
  target_version?: string | null
  download_url?: string | null
  created_at: string
}

export type TenantSubscriptionNotification = {
  id: string
  owner_admin_id: string
  message_type: string
  title: string
  content: string
  is_auto: boolean
  is_read: boolean
  is_active: boolean
  target_version?: string | null
  download_url?: string | null
  created_at: string
}

const MESSAGE_TITLES: Record<AdminMessageType, string> = {
  general: "Mensaje general",
  vencimiento: "Aviso de vencimiento",
  renovacion: "Renovacion de suscripcion",
  bloqueo: "Aviso importante",
  actualizacion: "Actualizacion de aplicacion",
}

const MESSAGE_SELECT =
  "id, message_type, content, scope, recipient_admin_ids, recipient_count, target_version, download_url, created_at"

export async function fetchAdminSubscriptionMessages(limit = 50) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("admin_subscription_messages")
    .select(MESSAGE_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as AdminSubscriptionMessage[]
}

export async function deleteAdminSubscriptionMessage(messageId: string) {
  const supabase = createClient()

  const { error: notificationError } = await supabase
    .from("tenant_subscription_notifications")
    .update({ is_active: false })
    .eq("admin_message_id", messageId)

  if (notificationError) throw notificationError

  const { error: systemMessageError } = await supabase
    .from("system_messages")
    .update({ is_active: false })
    .eq("admin_message_id", messageId)

  if (systemMessageError) throw systemMessageError

  const { error: messageError } = await supabase
    .from("admin_subscription_messages")
    .delete()
    .eq("id", messageId)

  if (messageError) throw messageError
}

export async function sendAdminSubscriptionMessage(params: {
  messageType: AdminMessageType
  content: string
  scope: AdminMessageScope
  recipientAdminIds: string[]
  sentBy?: string | null
  targetVersion?: string | null
  downloadUrl?: string | null
  broadcastToLogin?: boolean
}) {
  const supabase = createClient()
  const recipientIds = params.recipientAdminIds
  const recipientCount = recipientIds.length
  const targetVersion = params.targetVersion?.trim() || null
  const downloadUrl = params.downloadUrl?.trim() || null
  const content =
    params.messageType === "actualizacion" && targetVersion
      ? buildDefaultUpdateContent(targetVersion, params.content)
      : params.content.trim()

  const { data: messageRow, error: messageError } = await supabase
    .from("admin_subscription_messages")
    .insert({
      message_type: params.messageType,
      content,
      scope: params.scope,
      recipient_admin_ids: recipientIds,
      recipient_count: recipientCount,
      sent_by: params.sentBy ?? null,
      target_version: targetVersion,
      download_url: downloadUrl,
    })
    .select(MESSAGE_SELECT)
    .single()

  if (messageError) throw messageError

  if (params.messageType === "actualizacion" && params.scope === "all" && params.broadcastToLogin) {
    await supabase
      .from("system_messages")
      .update({ is_active: false })
      .eq("is_active", true)
      .not("target_version", "is", null)

    const { error: systemError } = await supabase.from("system_messages").insert({
      title: targetVersion ? `Actualizacion ${targetVersion}` : "Actualizacion disponible",
      content,
      message_type: "success",
      priority: 100,
      is_active: true,
      target_version: targetVersion,
      download_url: downloadUrl,
      admin_message_id: messageRow.id,
    })

    if (systemError) {
      throw new Error(
        `${systemError.message}. Ejecute la migracion 038-system-messages-and-app-updates.sql en Supabase.`,
      )
    }
  }

  if (recipientIds.length > 0 && !(params.messageType === "actualizacion" && params.broadcastToLogin)) {
    const notifications = recipientIds.map((ownerAdminId) => ({
      owner_admin_id: ownerAdminId,
      admin_message_id: messageRow.id,
      message_type: params.messageType,
      title: MESSAGE_TITLES[params.messageType],
      content,
      is_auto: false,
      is_active: true,
      target_version: targetVersion,
      download_url: downloadUrl,
    }))

    const { error: notifyError } = await supabase
      .from("tenant_subscription_notifications")
      .insert(notifications)

    if (notifyError) throw notifyError
  }

  return messageRow as AdminSubscriptionMessage
}

export async function fetchTenantSubscriptionNotifications(ownerAdminId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("tenant_subscription_notifications")
    .select(
      "id, owner_admin_id, message_type, title, content, is_auto, is_read, is_active, target_version, download_url, created_at",
    )
    .eq("owner_admin_id", ownerAdminId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) throw error

  return ((data ?? []) as TenantSubscriptionNotification[]).filter((row) => {
    if (row.message_type !== "actualizacion") return true
    return Boolean(row.target_version?.trim()) && Boolean(row.download_url?.trim())
  })
}

export async function upsertAutoRenewalNotification(params: {
  ownerAdminId: string
  content: string
  graceDaysRemaining: number
}) {
  const supabase = createClient()
  const title =
    params.graceDaysRemaining <= 0
      ? "Suscripcion vencida"
      : `Renueve su plan (${params.graceDaysRemaining} dia${params.graceDaysRemaining === 1 ? "" : "s"} restantes)`

  await supabase
    .from("tenant_subscription_notifications")
    .update({ is_active: false })
    .eq("owner_admin_id", params.ownerAdminId)
    .eq("is_auto", true)
    .eq("is_active", true)

  if (params.graceDaysRemaining <= 0) return

  const { error } = await supabase.from("tenant_subscription_notifications").insert({
    owner_admin_id: params.ownerAdminId,
    message_type: "auto_renovacion",
    title,
    content: params.content,
    is_auto: true,
    is_active: true,
  })

  if (error) throw error
}
