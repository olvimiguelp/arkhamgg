import { useState } from "react"
import { Loader2, Users, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Customer } from "@/components/store-context"

export interface AlmacenCustomerSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: Customer[]
  onConfirm: (customerName: string, customerPhone: string, sourceCustomerId: string | null) => void
  initialMode?: "select" | "new" | "import"
  onImportReturn?: () => void
}

type Mode = "select" | "new" | "import"

export function AlmacenCustomerSelector({
  open,
  onOpenChange,
  customers,
  onConfirm,
  initialMode = "select",
  onImportReturn,
}: AlmacenCustomerSelectorProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSelectMode = () => setMode("select")
  const handleNewMode = () => {
    setMode("new")
    setCustomerName("")
    setCustomerPhone("")
    setSelectedCustomerId("")
  }
  const handleImportMode = () => {
    setMode("import")
    setCustomerName("")
    setCustomerPhone("")
    setSelectedCustomerId("")
  }

  const handleConfirm = async () => {
    if (mode === "new") {
      if (!customerName.trim()) {
        return
      }
      setIsProcessing(true)
      try {
        onConfirm(customerName.trim(), customerPhone.trim(), null)
        setMode("select")
        setCustomerName("")
        setCustomerPhone("")
        onOpenChange(false)
      } finally {
        setIsProcessing(false)
      }
    } else if (mode === "import") {
      if (!selectedCustomerId || !customerName.trim()) {
        return
      }
      setIsProcessing(true)
      try {
        onConfirm(customerName.trim(), customerPhone.trim(), selectedCustomerId)
        setMode("select")
        setSelectedCustomerId("")
        setCustomerName("")
        setCustomerPhone("")
        onOpenChange(false)
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const handleImportCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId)
    const customer = customers.find((c) => c.id === customerId)
    if (customer) {
      setCustomerName(customer.name)
      setCustomerPhone(customer.phone)
    }
  }

  const isConfirmDisabled = () => {
    if (mode === "new") return !customerName.trim() || isProcessing
    if (mode === "import") return !selectedCustomerId || !customerName.trim() || isProcessing
    return false
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cliente del Almacén</DialogTitle>
          <DialogDescription>
            Selecciona un cliente existente o crea uno nuevo para el crédito
          </DialogDescription>
        </DialogHeader>

        {mode === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">¿Qué deseas hacer?</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="h-auto p-4 justify-start flex-col items-start"
                onClick={handleNewMode}
              >
                <span className="font-semibold gap-2 flex items-center">
                  <UserPlus className="h-4 w-4" />
                  Crear nuevo cliente
                </span>
                <span className="text-xs text-muted-foreground">
                  Registra un cliente nuevo en este momento
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto p-4 justify-start flex-col items-start"
                onClick={handleImportMode}
              >
                <span className="font-semibold gap-2 flex items-center">
                  <Users className="h-4 w-4" />
                  Usar cliente existente
                </span>
                <span className="text-xs text-muted-foreground">
                  Selecciona de tus clientes ya registrados
                </span>
              </Button>
            </div>
          </div>
        )}

        {mode === "new" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-customer-name">Nombre del cliente *</Label>
              <Input
                id="new-customer-name"
                placeholder="Nombre completo"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-customer-phone">Teléfono (opcional)</Label>
              <Input
                id="new-customer-phone"
                placeholder="Número de contacto"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>
        )}

        {mode === "import" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-customer">Seleccionar cliente *</Label>
              <Select value={selectedCustomerId} onValueChange={handleImportCustomerChange}>
                <SelectTrigger id="import-customer" disabled={isProcessing}>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No hay clientes registrados</div>
                  ) : (
                    customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div>
                          <div>{c.name}</div>
                          {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedCustomerId && (
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <div className="text-sm font-semibold">{customerName}</div>
                {customerPhone && <div className="text-xs text-muted-foreground">{customerPhone}</div>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode !== "select" && (
            <Button
              variant="outline"
              onClick={handleSelectMode}
              disabled={isProcessing}
            >
              Atrás
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled()}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : mode === "select" ? (
              "Continuar"
            ) : (
              "Confirmar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
