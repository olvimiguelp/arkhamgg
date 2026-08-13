export const DEFAULT_RENEWAL_GRACE_DAYS = 5
export const EXPIRING_SOON_DAYS = 7

export type SubscriptionAccessState =
  | "activo"
  | "por_vencer"
  | "en_gracia"
  | "bloqueado_suscripcion"
  | "suscripcion_suspendida"
  | "sin_suscripcion"
  | "acceso_abierto"

export type SubscriptionSnapshot = {
  endDate: Date | null
  renewalGraceDays: number
  /** Bloqueo manual desde panel de Suscripciones (no suspension de administrador) */
  subscriptionSuspended: boolean
  hasSubscription: boolean
  /** Super admin concede uso del panel sin revisar suscripcion */
  openAccess?: boolean
}

export type SubscriptionStatusResult = {
  accessState: SubscriptionAccessState
  daysUntilExpiry: number
  daysSinceExpiry: number
  graceDaysRemaining: number
  renewalGraceDays: number
  shouldBlockAfterLogin: boolean
  showRenewalPrompt: boolean
  graceEndDate: Date | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const startOfDay = (date: Date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const diffDays = (from: Date, to: Date) => {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

export function computeSubscriptionStatus(
  input: SubscriptionSnapshot,
  now: Date = new Date(),
): SubscriptionStatusResult {
  const renewalGraceDays = Math.max(0, input.renewalGraceDays ?? DEFAULT_RENEWAL_GRACE_DAYS)

  if (input.openAccess) {
    return {
      accessState: "acceso_abierto",
      daysUntilExpiry: 0,
      daysSinceExpiry: 0,
      graceDaysRemaining: renewalGraceDays,
      renewalGraceDays,
      shouldBlockAfterLogin: false,
      showRenewalPrompt: false,
      graceEndDate: null,
    }
  }

  if (input.subscriptionSuspended) {
    return {
      accessState: "suscripcion_suspendida",
      daysUntilExpiry: 0,
      daysSinceExpiry: 0,
      graceDaysRemaining: 0,
      renewalGraceDays,
      shouldBlockAfterLogin: true,
      showRenewalPrompt: false,
      graceEndDate: null,
    }
  }

  if (!input.hasSubscription || !input.endDate) {
    return {
      accessState: "sin_suscripcion",
      daysUntilExpiry: 0,
      daysSinceExpiry: 0,
      graceDaysRemaining: 0,
      renewalGraceDays,
      shouldBlockAfterLogin: true,
      showRenewalPrompt: false,
      graceEndDate: null,
    }
  }

  const endDate = startOfDay(input.endDate)
  const today = startOfDay(now)
  const daysUntilExpiry = diffDays(today, endDate)

  if (daysUntilExpiry > 0) {
    const accessState: SubscriptionAccessState =
      daysUntilExpiry <= EXPIRING_SOON_DAYS ? "por_vencer" : "activo"
    return {
      accessState,
      daysUntilExpiry,
      daysSinceExpiry: 0,
      graceDaysRemaining: renewalGraceDays,
      renewalGraceDays,
      shouldBlockAfterLogin: false,
      showRenewalPrompt: accessState === "por_vencer",
      graceEndDate: new Date(endDate.getTime() + renewalGraceDays * MS_PER_DAY),
    }
  }

  const daysSinceExpiry = Math.max(0, diffDays(endDate, today))
  const graceDaysRemaining = Math.max(0, renewalGraceDays - daysSinceExpiry)
  const graceEndDate = new Date(endDate.getTime() + renewalGraceDays * MS_PER_DAY)

  if (graceDaysRemaining > 0) {
    return {
      accessState: "en_gracia",
      daysUntilExpiry: 0,
      daysSinceExpiry,
      graceDaysRemaining,
      renewalGraceDays,
      shouldBlockAfterLogin: false,
      showRenewalPrompt: true,
      graceEndDate,
    }
  }

  return {
    accessState: "bloqueado_suscripcion",
    daysUntilExpiry: 0,
    daysSinceExpiry,
    graceDaysRemaining: 0,
    renewalGraceDays,
    shouldBlockAfterLogin: true,
    showRenewalPrompt: false,
    graceEndDate,
  }
}

export function mapAccessStateToPlanStatus(
  accessState: SubscriptionAccessState,
): "activo" | "por_vencer" | "vencido" | "bloqueado" {
  switch (accessState) {
    case "activo":
      return "activo"
    case "por_vencer":
      return "por_vencer"
    case "en_gracia":
      return "vencido"
    case "acceso_abierto":
      return "activo"
    case "suscripcion_suspendida":
    case "bloqueado_suscripcion":
    case "sin_suscripcion":
      return "bloqueado"
    default:
      return "activo"
  }
}
