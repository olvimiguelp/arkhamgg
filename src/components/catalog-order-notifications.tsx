import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { isAlmacenSourceRecord } from "@/lib/transaction-classification"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"

type CatalogOrderAlert = {
  invoiceNumber: string
  customerName: string
  total: number
}

type CatalogOrderRecord = Record<string, unknown>

function playNotificationTone(audioContext: AudioContext) {
  if (audioContext.state !== "running") return

  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = "sine"
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35)
  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.35)
}

export function CatalogOrderNotifications({ ownerAdminId }: { ownerAdminId: string }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [catalogOrderAlert, setCatalogOrderAlert] = useState<CatalogOrderAlert | null>(null)
  const [hasNewCatalogOrder, setHasNewCatalogOrder] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const notifiedOrderIds = useRef(new Set<string>())

  const handleCatalogOrder = useCallback((order: CatalogOrderRecord) => {
    const orderId = String(order.id ?? "")
    const items = Array.isArray(order.items) ? order.items : []
    const isWarehouseCatalogOrder =
      String(order.owner_admin_id ?? "") === ownerAdminId &&
      String(order.invoice_number ?? "").startsWith("WEB-") &&
      order.status === "pending" &&
      items.some((item) => isAlmacenSourceRecord(item as Record<string, unknown>))

    if (!orderId || !isWarehouseCatalogOrder || notifiedOrderIds.current.has(orderId)) return

    notifiedOrderIds.current.add(orderId)
    setHasNewCatalogOrder(true)
    setCatalogOrderAlert({
      invoiceNumber: String(order.invoice_number),
      customerName: String(order.customer_name || "Cliente"),
      total: Number(order.total) || 0,
    })

    const audioContext = audioContextRef.current
    if (audioContext?.state === "running") {
      try {
        playNotificationTone(audioContext)
      } catch (error) {
        console.warn("No se pudo reproducir el sonido del nuevo pedido:", error)
      }
    }
  }, [ownerAdminId])

  const enableNotificationSound = useCallback(async () => {
    try {
      const audioContext = audioContextRef.current ?? new window.AudioContext()
      audioContextRef.current = audioContext
      await audioContext.resume()
      if (audioContext.state !== "running") {
        throw new Error("El navegador no permitió activar el sonido")
      }
      playNotificationTone(audioContext)
      setSoundEnabled(true)
    } catch (error) {
      console.warn("No se pudo activar el sonido de notificaciones:", error)
      setSoundEnabled(false)
      toast({
        title: "No se pudo activar el sonido",
        description: "Revisa el volumen y los permisos de sonido de Safari e inténtalo nuevamente.",
        variant: "destructive",
      })
    }
  }, [toast])

  useEffect(() => {
    const channel = supabase
      .channel(`catalog-order-alerts-${ownerAdminId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sales",
          filter: `owner_admin_id=eq.${ownerAdminId}`,
        },
        (payload) => handleCatalogOrder(payload.new as CatalogOrderRecord),
      )
      .subscribe()

    let active = true
    let initialized = false
    let checking = false
    const checkForMissedOrders = async () => {
      if (!active || checking || document.visibilityState === "hidden") return
      checking = true
      try {
        const { data, error } = await supabase
          .from("sales")
          .select("id, owner_admin_id, invoice_number, customer_name, total, status, items")
          .eq("owner_admin_id", ownerAdminId)
          .like("invoice_number", "WEB-%")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20)

        if (error) throw error
        if (!active) return

        for (const order of data ?? []) {
          if (!initialized) {
            notifiedOrderIds.current.add(String(order.id))
          } else {
            handleCatalogOrder(order as CatalogOrderRecord)
          }
        }
        initialized = true
      } catch (error) {
        console.warn("No se pudieron comprobar pedidos nuevos del catálogo:", error)
      } finally {
        checking = false
      }
    }

    const intervalId = window.setInterval(() => void checkForMissedOrders(), 15000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (audioContextRef.current?.state !== "running") setSoundEnabled(false)
        void checkForMissedOrders()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    void checkForMissedOrders()

    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [handleCatalogOrder, ownerAdminId, supabase])

  useEffect(() => () => {
    const audioContext = audioContextRef.current
    if (audioContext && audioContext.state !== "closed") void audioContext.close()
  }, [])

  return (
    <>
      <div className="flex justify-end pb-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void enableNotificationSound()}
          aria-pressed={soundEnabled}
        >
          {hasNewCatalogOrder && <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />}
          {soundEnabled ? <Volume2 /> : <VolumeX />}
          {soundEnabled ? "Probar sonido" : "Activar sonido"}
        </Button>
      </div>
      <Dialog
        open={Boolean(catalogOrderAlert)}
        onOpenChange={(open) => {
          if (!open) {
            setCatalogOrderAlert(null)
            setHasNewCatalogOrder(false)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
              ¡Nuevo pedido del almacén!
            </DialogTitle>
            <DialogDescription>
              Llegó un pedido del catálogo de almacén y está esperando en la cola exclusiva.
            </DialogDescription>
          </DialogHeader>
          {catalogOrderAlert && (
            <div className="space-y-2 rounded-md border p-4 text-sm">
              <p><span className="font-medium">Cliente:</span> {catalogOrderAlert.customerName}</p>
              <p><span className="font-medium">Factura:</span> {catalogOrderAlert.invoiceNumber}</p>
              <p><span className="font-medium">Total:</span> ${formatCurrency(catalogOrderAlert.total)}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setCatalogOrderAlert(null)
                setHasNewCatalogOrder(false)
                navigate("/cola-exclusiva")
              }}
            >
              Ver cola exclusiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
