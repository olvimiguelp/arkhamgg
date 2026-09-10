"use client"

import { ArrowRight, Landmark } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { MENU_ITEMS } from "@/components/sidebar"
import { useStore } from "@/components/store-context"
import { tenantCanAccessMenuItem } from "@/lib/tenant-permissions"

const FINANCE_ITEM_IDS = new Set([
  "purchase-invoices",
  "accounts-payable",
  "reports",
  "cash-closing",
  "warehouse-closing",
])

export default function FinanzasPage() {
  const navigate = useNavigate()
  const { currentUser, employees } = useStore()
  const financeItems = MENU_ITEMS.filter(
    (item) => FINANCE_ITEM_IDS.has(item.id) && tenantCanAccessMenuItem(currentUser, employees, item),
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Finanzas</h1>
            <p className="mt-2 text-muted-foreground">
              Administra las cuentas pendientes y realiza los cierres diarios del negocio.
            </p>
          </div>
        </div>
      </div>

      {financeItems.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-3">
          {financeItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.to)}
                className="group flex min-h-52 flex-col justify-between rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-lg"
              >
                <div>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{item.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.subtitle}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-amber-600">
                  Abrir sección
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          No tienes páginas financieras habilitadas.
        </div>
      )}
    </div>
  )
}
