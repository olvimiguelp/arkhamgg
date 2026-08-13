import type { Sale } from "@/components/store-context"
import { Badge } from "@/components/ui/badge"
import { getSaleCreditPendingAmount } from "@/lib/credit-sale-utils"
import { formatCurrency } from "@/lib/utils"

export function isFacturaPagada(
  sale: Pick<Sale, "total" | "amountPaid" | "paymentMethod" | "status" | "creditResolved">,
) {
  if (getSaleCreditPendingAmount(sale) > 0) return false
  if (sale.creditResolved) return true

  const total = Math.max(0, Number(sale.total) || 0)
  const paid = Math.min(total, Math.max(0, Number(sale.amountPaid) || 0))
  if (paid < total) return false

  return sale.status === "completada" && sale.paymentMethod === "credit"
}

export function FacturaPagada({
  sale,
}: {
  sale: Pick<Sale, "total" | "amountPaid" | "paymentMethod" | "status" | "invoiceNumber" | "creditResolved">
}) {
  if (!isFacturaPagada(sale)) return null

  const total = Math.max(0, Number(sale.total) || 0)

  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      Pagada · {formatCurrency(total)}
    </Badge>
  )
}
