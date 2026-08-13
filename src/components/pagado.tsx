import type { Sale } from "@/components/store-context"

export function Pagado({
  sale,
}: {
  sale: Pick<Sale, "amountPaid">
}) {
  const totalPaid = Math.max(0, Number(sale.amountPaid) || 0)

  return (
    <span className="font-medium text-emerald-700">
      ${totalPaid.toLocaleString()}
    </span>
  )
}
