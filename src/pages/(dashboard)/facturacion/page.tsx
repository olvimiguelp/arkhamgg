"use client"

import { useState } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import { Building2, FileText, Download, Eye, Calendar, DollarSign } from "lucide-react"

export default function FacturacionPage() {
  const { businesses } = useBusinessContext()
  const [selectedMonth, setSelectedMonth] = useState("2024-11")

  // Generate invoices from businesses with subscriptions
  const invoices = businesses
    .filter((b) => b.subscription)
    .map((b, index) => ({
      id: `FAC-${new Date().getFullYear()}-${String(index + 1).padStart(3, "0")}`,
      business: b.name,
      amount: b.subscription!.price,
      date: b.subscription!.startDate.toISOString().split("T")[0],
      status: b.subscription!.status === "activo" ? "pagada" : b.isBlocked ? "vencida" : "pendiente",
    }))

  const totalPagado = invoices.filter(i => i.status === "pagada").reduce((acc, i) => acc + i.amount, 0)
  const totalPendiente = invoices.filter(i => i.status === "pendiente").reduce((acc, i) => acc + i.amount, 0)
  const totalVencido = invoices.filter(i => i.status === "vencida").reduce((acc, i) => acc + i.amount, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Facturacion</h1>
          <p className="text-muted-foreground mt-1">Gestiona las facturas de suscripciones</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium text-sm">
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${totalPagado.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Total pagado</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${totalPendiente.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Pendiente de pago</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${totalVencido.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Facturas vencidas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="font-semibold text-foreground">Facturas recientes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-4 font-semibold text-foreground">Factura</th>
                <th className="text-left p-4 font-semibold text-foreground">Empresa</th>
                <th className="text-left p-4 font-semibold text-foreground">Fecha</th>
                <th className="text-left p-4 font-semibold text-foreground">Monto</th>
                <th className="text-left p-4 font-semibold text-foreground">Estado</th>
                <th className="text-right p-4 font-semibold text-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const business = businesses.find(b => b.name === invoice.business)
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                          <FileText className="h-5 w-5" />
                        </div>
                        <span className="font-medium text-foreground">{invoice.id}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {business?.logo ? (
                          <img src={business.logo} alt="" className="h-8 w-8 rounded-lg object-cover border border-border" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-slate-500" />
                          </div>
                        )}
                        <span className="text-foreground">{invoice.business}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(invoice.date).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-foreground">${invoice.amount.toFixed(2)}</span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-3 py-1 rounded-xl text-xs font-medium capitalize ${
                        invoice.status === "pagada" ? "bg-emerald-500/10 text-emerald-600" :
                        invoice.status === "pendiente" ? "bg-amber-500/10 text-amber-600" :
                        "bg-red-500/10 text-red-600"
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Ver factura">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Descargar">
                          <Download className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


