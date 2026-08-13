import { useMemo, useState } from "react"
import { History, Search, User, Smartphone, Phone, CreditCard } from "lucide-react"
import type { RepairHistory } from "@/components/store-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface RepairHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: RepairHistory[]
  onUseCustomer: (repair: RepairHistory) => void
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function RepairHistoryDialog({ open, onOpenChange, history, onUseCustomer }: RepairHistoryDialogProps) {
  const [search, setSearch] = useState("")
  const filteredHistory = useMemo(() => {
    const query = normalize(search.trim())
    const digits = search.replace(/\D/g, "")
    return history.filter((repair) => {
      if (!query) return true
      const textMatch = [repair.client, repair.cedula || "", repair.customerPhone || repair.whatsapp || "", repair.device, repair.repair_number || ""]
        .some((value) => normalize(value).includes(query))
      const digitsMatch = digits.length > 0 && [repair.cedula || "", repair.customerPhone || repair.whatsapp || ""]
        .some((value) => value.replace(/\D/g, "").includes(digits))
      return textMatch || digitsMatch
    })
  }, [history, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            Historial de reparaciones
          </DialogTitle>
          <DialogDescription>
            Consulta órdenes anteriores aunque el cliente o la orden ya no estén en la lista activa.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, cédula, teléfono, equipo o ticket"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
              {history.length === 0 ? "Todavía no hay reparaciones archivadas." : "No se encontraron coincidencias."}
            </div>
          ) : filteredHistory.map((repair) => (
            <div key={repair.id} className="rounded-xl border bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-blue-600">#{repair.repair_number || "Sin ticket"}</span>
                    <span className="text-gray-500">{new Date(repair.date).toLocaleDateString("es-DO")}</span>
                  </div>
                  <p className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white"><User className="h-3.5 w-3.5 text-gray-400" />{repair.client}</p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
                    <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{repair.customerPhone || repair.whatsapp || "Sin teléfono"}</span>
                    <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />{repair.cedula || "Sin cédula"}</span>
                  </p>
                  <p className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300"><Smartphone className="h-3.5 w-3.5 text-gray-400" />{repair.device || `${repair.brand || ""} ${repair.model || ""}`.trim() || "Sin equipo"}</p>
                  <p className="text-gray-500">Falla: {repair.issue || "No especificada"}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onUseCustomer(repair)} className="shrink-0 text-xs">
                  Usar datos del cliente
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
