import type { Sale } from "@/components/store-context"

export type PaymentAllocation = {
  saleId: string
  invoiceNumber: string
  pendingAmount: number
  appliedAmount: number
  remainingAmount: number
}

export const getSaleCreditPendingAmount = (
  sale: Pick<Sale, "total" | "amountPaid" | "paymentMethod" | "status">,
): number => {
  const total = Math.max(0, Number(sale.total) || 0)
  const paid = Math.min(total, Math.max(0, Number(sale.amountPaid) || 0))
  const pending = Math.max(0, total - paid)

  if (pending <= 0) return 0
  if (sale.status === "credito" || sale.paymentMethod === "credit") return pending

  // Pago parcial: una parte en caja y el resto a crédito.
  if (paid > 0 && paid < total) return pending

  return 0
}

export const isSaleWithCreditDebt = (
  sale: Pick<Sale, "total" | "amountPaid" | "paymentMethod" | "status">,
) => getSaleCreditPendingAmount(sale) > 0

/** Oculta facturas de crédito ya saldadas al 100%. */
export const shouldShowInCustomerPurchaseHistory = (
  sale: Pick<Sale, "total" | "amountPaid" | "paymentMethod" | "status" | "creditResolved">,
  options?: { creditOnly?: boolean },
) => {
  const pending = getSaleCreditPendingAmount(sale)
  if (pending > 0) return true
  if (options?.creditOnly) return false
  if (sale.creditResolved) return false

  const wasCreditSale = sale.status === "credito" || sale.paymentMethod === "credit"
  if (wasCreditSale) return false

  return true
}

const parseTimestamp = (value?: string | null) => {
  const parsed = Date.parse(value ?? "")
  return Number.isFinite(parsed) ? parsed : 0
}

/** Momento exacto de creación (fecha + hora + minutos). */
export const getSaleCreatedTimestamp = (sale: Pick<Sale, "date" | "createdAt" | "id">) => {
  const createdAt = parseTimestamp(sale.createdAt)
  if (createdAt > 0) return createdAt
  return parseTimestamp(sale.date)
}

export const formatSaleCreatedDateTime = (
  sale: Pick<Sale, "date" | "createdAt">,
  locale = "es-ES",
) => {
  const timestamp = getSaleCreatedTimestamp(sale)
  if (timestamp <= 0) return "—"
  return new Date(timestamp).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const compareSalesByCreatedDesc = (
  a: Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">,
  b: Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">,
) => {
  const timeDiff = getSaleCreatedTimestamp(b) - getSaleCreatedTimestamp(a)
  if (timeDiff !== 0) return timeDiff

  const invoiceDiff = String(b.invoiceNumber || "").localeCompare(String(a.invoiceNumber || ""), undefined, {
    numeric: true,
  })
  if (invoiceDiff !== 0) return invoiceDiff

  return String(b.id).localeCompare(String(a.id))
}

const compareSalesByCreatedAsc = (
  a: Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">,
  b: Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">,
) => -compareSalesByCreatedDesc(a, b)

export const sortSalesByRecencyDesc = <T extends Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">>(
  sales: T[],
) => [...sales].sort(compareSalesByCreatedDesc)

export const sortSalesByFifoAsc = <T extends Pick<Sale, "date" | "createdAt" | "id" | "invoiceNumber">>(
  sales: T[],
) => [...sales].sort(compareSalesByCreatedAsc)

/** Alias: la primera en entrar (más antigua) va primero. */
export const sortSalesByRecencyAsc = sortSalesByFifoAsc

export const getFirstCreatedPendingSale = <T extends Sale>(sales: T[]) => {
  const pendingSales = sales.filter((sale) => getSaleCreditPendingAmount(sale) > 0)
  return sortSalesByFifoAsc(pendingSales)[0]
}

/** @deprecated Usar getFirstCreatedPendingSale para abonos sin selección (FIFO). */
export const getLastCreatedPendingSale = <T extends Sale>(sales: T[]) => {
  const pendingSales = sales.filter((sale) => getSaleCreditPendingAmount(sale) > 0)
  return sortSalesByRecencyDesc(pendingSales)[0]
}

/**
 * Distribuye un abono entre facturas pendientes.
 *
 * FIFO (primera en entrar, primera en salir):
 * - Sin selección: la factura más antigua por fecha/hora de creación recibe primero el abono.
 * - Con selección: aplica a la(s) elegida(s) y el sobrante sigue FIFO (más antiguas primero).
 */
export const allocatePaymentToInvoices = (
  sales: Sale[],
  amount: number,
  selectedSaleIds: string[] = [],
): PaymentAllocation[] => {
  const normalizedAmount = Math.max(0, Number(amount) || 0)
  const allPendingSales = sales.filter((sale) => getSaleCreditPendingAmount(sale) > 0)

  if (normalizedAmount <= 0 || allPendingSales.length === 0) return []

  const appliedBySaleId = new Map<string, number>()
  const getApplied = (saleId: string) => appliedBySaleId.get(saleId) ?? 0

  const getStillPending = (sale: Sale) => {
    const pendingAmount = getSaleCreditPendingAmount(sale)
    return Math.max(0, pendingAmount - getApplied(sale.id))
  }

  const applyToSale = (sale: Sale, available: number) => {
    if (available <= 0) return 0

    const stillPending = getStillPending(sale)
    if (stillPending <= 0) return available

    const appliedNow = Math.min(stillPending, available)
    appliedBySaleId.set(sale.id, getApplied(sale.id) + appliedNow)
    return available - appliedNow
  }

  let remainingAmount = normalizedAmount
  const hasSelection = selectedSaleIds.length > 0
  const selectedIds = new Set(selectedSaleIds)

  if (!hasSelection) {
    for (const sale of sortSalesByFifoAsc(allPendingSales)) {
      remainingAmount = applyToSale(sale, remainingAmount)
      if (remainingAmount <= 0) break
    }
  } else {
    const phase1Sales = sortSalesByRecencyDesc(
      allPendingSales.filter((sale) => selectedIds.has(sale.id)),
    )

    for (const sale of phase1Sales) {
      remainingAmount = applyToSale(sale, remainingAmount)
      if (remainingAmount <= 0) break
    }

    if (remainingAmount > 0) {
      for (const sale of sortSalesByFifoAsc(
        allPendingSales.filter((sale) => getStillPending(sale) > 0),
      )) {
        remainingAmount = applyToSale(sale, remainingAmount)
        if (remainingAmount <= 0) break
      }
    }
  }

  return allPendingSales
    .filter((sale) => getApplied(sale.id) > 0)
    .map((sale) => {
      const pendingAmount = getSaleCreditPendingAmount(sale)
      const appliedAmount = getApplied(sale.id)
      return {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        pendingAmount,
        appliedAmount,
        remainingAmount: Math.max(0, pendingAmount - appliedAmount),
      }
    })
}
