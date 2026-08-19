"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useStore, type Repair, type RepairHistory } from "@/components/store-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RepairDialog } from "@/components/reparaciones/repair-dialog"
import { RepairHistoryDialog } from "@/components/reparaciones/repair-history-dialog"
import { UnexpectedFaultDialog } from "@/components/reparaciones/unexpected-fault-dialog"
import {
  RepairTicketPrint,
  RepairStickerPrint,
  printRepairTicketDirect,
  printRepairStickerDirect,
} from "@/components/reparaciones/repair-print-templates"
import { useToast } from "@/hooks/use-toast"
import { useRealtimeTableRefresh } from "@/hooks/use-realtime-table-refresh"
import { getPhoneForRepair, formatDeviceName } from "@/lib/repair-utils"
import { sendWhatsappBotMessage } from "@/lib/whatsapp-bot"
import { getTenantBranding } from "@/lib/tenant-branding"
import { getRepairPhotoUrl } from "@/lib/repair-photo-storage"
import {
  Wrench,
  Plus,
  Search,
  MessageSquare,
  Printer,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Edit,
  Trash2,
  DollarSign,
  Smartphone,
  User,
  Hash,
  ShieldAlert,
  ArrowRight,
  Filter,
  Eye,
  QrCode,
  History,
  CalendarDays,
  Phone,
} from "lucide-react"

const WORKFLOW_STATES = [
  { id: "todos", label: "Todos", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  { id: "recibido", label: "Recibido", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200" },
  { id: "en_diagnostico", label: "En Diagnóstico / Reparación", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" },
  { id: "esperando_repuesto", label: "Esperando Repuesto", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200" },
  { id: "listo", label: "Listo para Entrega", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" },
  { id: "entregado", label: "Entregado y Facturado", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200" },
  { id: "no_resulto", label: "No resultó", color: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200" },
]

const isTerminalRepairStatus = (status?: string) => status === "entregado" || status === "no_resulto"

export default function ReparacionesPage() {
  const { repairs, repairHistory, updateRepair, deleteRepair, customers, currentUser, setOnDialogOpen, addToCart } = useStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const canAddRepairs = currentUser?.role === "admin" || Boolean(currentUser?.permissions?.canAdd)
  const canEditRepairs = currentUser?.role === "admin" || Boolean(currentUser?.permissions?.canEdit)
  const canDeleteRepairs = currentUser?.role === "admin" || Boolean(currentUser?.permissions?.canDelete)

  const [search, setSearch] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("recibido")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [prefillRepair, setPrefillRepair] = useState<RepairHistory | null>(null)
  const [editingRepair, setEditingRepair] = useState<Repair | null>(null)
  const [notesRepair, setNotesRepair] = useState<Repair | null>(null)
  const [technicianNotes, setTechnicianNotes] = useState("")
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Unexpected fault dialog state
  const [isUnexpectedFaultOpen, setIsUnexpectedFaultOpen] = useState(false)
  const [selectedFaultRepair, setSelectedFaultRepair] = useState<Repair | null>(null)

  // Print state
  const [printRepair, setPrintRepair] = useState<Repair | null>(null)
  const [printType, setPrintType] = useState<"ticket" | "sticker" | null>(null)
  const [showPrintPreview, setShowPrintPreview] = useState(false)

  // QR scan detail state
  const [scanRepair, setScanRepair] = useState<Repair | null>(null)
  const [showScanDetailsDialog, setShowScanDetailsDialog] = useState(false)
  const [scanPhotoUrls, setScanPhotoUrls] = useState<string[]>([])

  const handleOpenNew = useCallback(() => {
    setEditingRepair(null)
    setPrefillRepair(null)
    setIsDialogOpen(true)
  }, [setEditingRepair, setPrefillRepair, setIsDialogOpen])

  useEffect(() => {
    if (setOnDialogOpen) {
      if (canAddRepairs) {
        setOnDialogOpen(handleOpenNew)
      } else {
        setOnDialogOpen(() => {})
      }
    }

    return () => {
      if (setOnDialogOpen) {
        setOnDialogOpen(() => {})
      }
    }
  }, [setOnDialogOpen, canAddRepairs, handleOpenNew])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const repairNumber = params.get("repair")?.trim()

    if (!repairNumber) {
      setScanRepair(null)
      setShowScanDetailsDialog(false)
      return
    }

    const relatedRepair = repairs.find((item) => (item.repair_number || "").toLowerCase() === repairNumber.toLowerCase())
    if (!relatedRepair) {
      setScanRepair(null)
      setShowScanDetailsDialog(false)
      return
    }

    // El QR debe abrir directamente la misma ventana de "Registrar recepción"
    // con la orden cargada, sin obligar al técnico a buscarla en la lista.
    setEditingRepair(null)
    setIsDialogOpen(false)
    setScanRepair(relatedRepair)
    setShowScanDetailsDialog(true)
    setScanPhotoUrls([])
    void Promise.allSettled((relatedRepair.photos || []).map((photo) => getRepairPhotoUrl(photo.storagePath)))
      .then((results) => {
        setScanPhotoUrls(
          results
            .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
            .map((result) => result.value),
        )
      })
  }, [location.search, repairs])

  // Realtime refresh for repairs table
  useRealtimeTableRefresh("repairs", () => {
    // This hook ensures the page refreshes when repairs change in realtime
    // The state will be updated from the store context automatically
  })

  const handleEdit = (repair: Repair) => {
    if (!canEditRepairs || isTerminalRepairStatus(repair.status)) return
    setPrefillRepair(null)
    setEditingRepair(repair)
    setIsDialogOpen(true)
  }

  const handleUseHistory = (repair: RepairHistory) => {
    setIsHistoryOpen(false)
    setEditingRepair(null)
    setPrefillRepair(repair)
    setIsDialogOpen(true)
  }

  const handleOpenNotes = (repair: Repair) => {
    setNotesRepair(repair)
    setTechnicianNotes(repair.technicianNotes || "")
  }

  const handleSaveNotes = async () => {
    if (!notesRepair) return
    setIsSavingNotes(true)
    try {
      await updateRepair(notesRepair.id, { technicianNotes: technicianNotes.trim() })
      if (scanRepair?.id === notesRepair.id) {
        setScanRepair((current) => current ? { ...current, technicianNotes: technicianNotes.trim() } : current)
      }
      toast({ title: "Notas guardadas", description: "Las notas del técnico fueron guardadas en la orden." })
      setNotesRepair(null)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "No se pudieron guardar las notas.", variant: "destructive" })
    } finally {
      setIsSavingNotes(false)
    }
  }

  const scanDetails = scanRepair
    ? {
        client: scanRepair.client || "Cliente General",
        phone: scanRepair.customerPhone || scanRepair.whatsapp || "N/A",
        device: formatDeviceName(scanRepair.brand, scanRepair.model, scanRepair.device),
        imei: scanRepair.imei || "N/A",
        issue: scanRepair.issue || "No especificada",
        password: scanRepair.password || "No registrada",
        unlockPattern: scanRepair.unlockPattern || "No registrado",
        visualNotes: scanRepair.visualNotes || "No especificadas",
        service: scanRepair.type || "No especificado",
        technicianNotes: scanRepair.technicianNotes || "No hay notas agregadas.",
        checklist: scanRepair.checklist && typeof scanRepair.checklist === "object" ? scanRepair.checklist : {},
      }
    : null

  const persistScanRepairStatus = async () => {
    if (!scanRepair) return

    const currentRepair = repairs.find((repair) => repair.id === scanRepair.id)
    if (!currentRepair || currentRepair.status === scanRepair.status) return

    try {
      await updateRepair(scanRepair.id, { status: scanRepair.status })
    } catch (err) {
      console.error("Error saving scan repair status on close:", err)
    }
  }

  const handleCloseScanDetails = async (open: boolean) => {
    if (!open) {
      await persistScanRepairStatus()
    }

    setShowScanDetailsDialog(open)
    if (!open && location.search) {
      navigate("/reparaciones", { replace: true })
    }
  }

  const handleDelete = async (id: string) => {
    const repair = repairs.find((item) => item.id === id)
    if (repair && isTerminalRepairStatus(repair.status)) {
      toast({
        title: "Orden bloqueada",
        description: "Una orden entregada y facturada no se puede eliminar.",
        variant: "destructive",
      })
      return
    }

    if (window.confirm("¿Estás seguro de eliminar esta orden de reparación?")) {
      try {
        await deleteRepair(id)
        toast({
          title: "Orden eliminada",
          description: "La reparación fue removida correctamente.",
        })
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "No se pudo eliminar la reparación.",
          variant: "destructive",
        })
      }
    }
  }

  const handleStatusChange = async (repairId: string, newStatus: string) => {
    const currentRepair = repairs.find((repair) => repair.id === repairId)
    if (!currentRepair) return

    const canReturnToReceived = isTerminalRepairStatus(currentRepair.status) && newStatus === "recibido"

    if (isTerminalRepairStatus(currentRepair.status) && !canReturnToReceived && newStatus !== currentRepair.status) {
      toast({
        title: "Orden bloqueada",
        description: "Una orden entregada y facturada solo puede regresar a recibido si se confirma el error de facturación.",
        variant: "destructive",
      })
      return
    }

    try {
      await updateRepair(repairId, { status: newStatus })
      if (scanRepair?.id === repairId) {
        setScanRepair((current) => current ? { ...current, status: newStatus } : current)
      }
      const statusObj = WORKFLOW_STATES.find((s) => s.id === newStatus)
      toast({
        title: "Estado actualizado",
        description: `La orden pasó a estado: ${statusObj?.label || newStatus}`,
      })
    } catch (err: any) {
      console.error("handleStatusChange error:", err)
      toast({
        title: "Error",
        description: err?.message || "No se pudo actualizar el estado.",
        variant: "destructive",
      })
    }
  }

  const handleReturnToReceived = async (repairId: string) => {
    const currentRepair = repairs.find((repair) => repair.id === repairId)
    if (!currentRepair || !isTerminalRepairStatus(currentRepair.status)) {
      toast({
        title: "Acción no disponible",
        description: "Solo una orden entregada y facturada puede regresar a recibido.",
        variant: "destructive",
      })
      return
    }

    try {
      await updateRepair(repairId, { status: "recibido" })
      if (scanRepair?.id === repairId) {
        setScanRepair((current) => current ? { ...current, status: "recibido" } : current)
      }
      toast({
        title: "Orden regresada",
        description: "La reparación volvió a estado Recibido.",
      })
    } catch (err: any) {
      console.error("handleReturnToReceived error:", err)
      toast({
        title: "Error",
        description: err?.message || "No se pudo devolver la orden a recibido.",
        variant: "destructive",
      })
    }
  }

  const handleNotifyWhatsapp = async (repair: Repair) => {
    const rawPhone = getPhoneForRepair(repair, customers)
    const targetPhone = rawPhone.replace(/\D/g, "")

    if (!targetPhone) {
      toast({
        title: "Sin número de teléfono",
        description: "Esta orden no tiene un teléfono o WhatsApp registrado.",
        variant: "destructive",
      })
      return
    }

    const ticketNumber = repair.repair_number || "Orden"
    const totalCost = Number(repair.cost) || 0
    const depositAmt = Number(repair.deposit) || 0
    const pendingAmt = repair.pendingBalance !== undefined ? Number(repair.pendingBalance) : Math.max(0, totalCost - depositAmt)
    const statusLabel = WORKFLOW_STATES.find((s) => s.id === repair.status)?.label || repair.status

    const deviceFull = formatDeviceName(repair.brand, repair.model, repair.device) || "su equipo"
    const deviceWithColor = repair.color?.trim() ? `${deviceFull} (${repair.color.trim()})` : deviceFull
    const imeiLine = repair.imei?.trim() ? `IMEI: ${repair.imei.trim()}\n` : ""
    const formattedCost = `$${totalCost.toFixed(2)}`
    const formattedDeposit = `$${depositAmt.toFixed(2)}`
    const formattedPending = `$${pendingAmt.toFixed(2)}`

    const branding = await getTenantBranding(currentUser?.ownerAdminId)
    const companyName = (branding.businessName || "ARKHAM").toUpperCase()

    let message = ""
    if (repair.status === "recibido" || !repair.status) {
      message = `🛠️ ${companyName} - RECEPCIÓN DE EQUIPO\n\nEstimado/a ${repair.client || "Cliente"}, confirmamos el ingreso de su equipo a nuestro taller:\n\nOrden N°: ${ticketNumber}\nEquipo: ${deviceWithColor}\n${imeiLine}Falla Reportada: ${repair.issue || "Diagnóstico / Revisión"}\nServicio a Realizar: ${repair.type || "Reparación General"}\nPresupuesto Estimado: ${formattedCost}\nAbono Recibido: ${formattedDeposit}\nSaldo Pendiente: ${formattedPending}\n\nLe mantendremos informado sobre el avance. ¡Gracias por confiar en nosotros!`
    } else {
      message = `🛠️ ${companyName} - ACTUALIZACIÓN DE ORDEN\n\nEstimado/a ${repair.client || "Cliente"}, le informamos que su equipo ${deviceWithColor} (Orden N°: ${ticketNumber}) se encuentra en estado: *${statusLabel}*.\n\nFalla Reportada: ${repair.issue || "Diagnóstico / Revisión"}\nServicio a Realizar: ${repair.type || "Reparación General"}\nPresupuesto Estimado: ${formattedCost}\nAbono Recibido: ${formattedDeposit}\nSaldo Pendiente: ${formattedPending}\n\nLe mantendremos informado sobre el avance. ¡Gracias por confiar en nosotros!`
    }

    const res = await sendWhatsappBotMessage({
      id: repair.id,
      phone: targetPhone,
      message,
      name: repair.client,
      repairNumber: String(ticketNumber),
    })

    if (res.usedBot) {
      toast({
        title: "Notificación enviada por WhatsApp Bot",
        description: `Se notificó a ${repair.client} sobre el estado (${statusLabel}) de su orden #${ticketNumber}.`,
      })
    } else {
      toast({
        title: "Abriendo WhatsApp",
        description: "Se abrió WhatsApp Web/App para enviar la notificación.",
      })
    }
  }

  const handleConvertToInvoice = async (repair: Repair) => {
    if (isTerminalRepairStatus(repair.status)) {
      toast({
        title: "Orden ya facturada",
        description: "Esta orden ya está entregada y facturada.",
        variant: "destructive",
      })
      return
    }

    const totalCost = Number(repair.cost) || 0
    const depositAmt = Number(repair.deposit) || 0
    const pendingAmt = repair.pendingBalance !== undefined ? Number(repair.pendingBalance) : Math.max(0, totalCost - depositAmt)

    const rawServiceItems = repair.serviceItems?.filter((item) => item.name) || []
    const serviceItems = rawServiceItems.length > 0
      ? rawServiceItems
      : [{ name: repair.type || "Reparación", pieceCost: 0, charge: totalCost }]
    const serviceChargeTotal = serviceItems.reduce((sum, item) => sum + (Number(item.charge) || 0), 0) || totalCost
    const deviceName = formatDeviceName(repair.brand, repair.model, repair.device)
    const repairItems = serviceItems.map((service, index) => {
      const serviceCharge = Number(service.charge) || 0
      const lineTotal = pendingAmt > 0 && serviceChargeTotal > 0
        ? pendingAmt * (serviceCharge / serviceChargeTotal)
        : serviceCharge
      return {
        id: `repair-${repair.id}-${index}`,
        cartId: `repair-${repair.id}-${index}`,
        sku: "REP-001",
        name: `${deviceName} (${service.name})`,
        category: "Reparaciones",
        stock: 1,
        minStock: 0,
        buyPrice: Number(service.pieceCost) || 0,
        wholesalePrice: serviceCharge,
        sellPrice: lineTotal,
        customPrice: lineTotal,
        quantity: 1,
        supplier: "Taller Interno",
        sourceTable: "manual" as const,
        sourceId: `${repair.id}-${index}`,
      }
    })

    // Cargar los items al carrito y abrir la página de ventas para edición
    try {
      await updateRepair(repair.id, { status: "entregado" })
      repairItems.forEach((item) => addToCart(item))
      toast({
        title: "Orden enviada a facturaciÃ³n",
        description: `La orden quedÃ³ en Entregado y Facturado. Saldo cargado: RD$ ${pendingAmt}.`,
      })
      navigate("/ventas")
    } catch (err: unknown) {
      toast({
        title: "Error al facturar",
        description: err instanceof Error ? err.message : "No se pudo cerrar la orden de reparaciÃ³n.",
        variant: "destructive",
      })
    }
  }

  const handleTriggerPrint = (repair: Repair, type: "ticket" | "sticker") => {
    console.debug("handleTriggerPrint()", { repairNumber: repair?.repair_number, type, currentUserId: currentUser?.id, adminId: currentUser?.adminId })
    setPrintRepair(repair)
    setPrintType(type)
    // show preview modal first; actual printing on confirmation
    setShowPrintPreview(true)
  }

  const handleConfirmPrint = async () => {
    if (!printRepair || !printType) return
      console.debug("handleConfirmPrint()", { printType, repairNumber: printRepair?.repair_number, adminId: currentUser?.adminId })
      try {
      if (printType === "ticket") {
        await printRepairTicketDirect(printRepair, undefined, undefined, undefined, currentUser?.adminId)
      } else {
        await printRepairStickerDirect(printRepair, undefined, currentUser?.adminId)
      }
    } catch (err) {
      console.error("Error printing:", err)
    } finally {
      setShowPrintPreview(false)
      setPrintRepair(null)
      setPrintType(null)
    }
  }

  // Filter repairs
  const filteredRepairs = repairs.filter((r) => {
    const phone = getPhoneForRepair(r, customers)
    const matchesSearch =
      (r.client || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.device || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.issue || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.imei || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.repair_number || "").toLowerCase().includes(search.toLowerCase()) ||
      phone.includes(search)

    const matchesStatus =
      selectedStatus === "todos" ? true : (r.status || "recibido") === selectedStatus

    return matchesSearch && matchesStatus
  })

  // KPI Calculations
  const countRecibido = repairs.filter((r) => r.status === "recibido" || !r.status).length
  const countDiagnostico = repairs.filter((r) => r.status === "en_diagnostico").length
  const countRepuesto = repairs.filter((r) => r.status === "esperando_repuesto").length
  const countListo = repairs.filter((r) => r.status === "listo").length
  const countEntregado = repairs.filter((r) => r.status === "entregado").length
  const countNoResulto = repairs.filter((r) => r.status === "no_resulto").length
  const totalPendingMoney = repairs
    // A delivered/invoiced or unsuccessful-and-returned repair no longer
    // belongs to the workshop receivables.
    .filter((r) => r.status !== "entregado" && r.status !== "no_resulto")
    .reduce((sum, r) => {
      const costNum = Number(r.cost) || 0
      const depositNum = Number(r.deposit) || 0
      const pending = r.pendingBalance !== undefined ? Number(r.pendingBalance) : Math.max(0, costNum - depositNum)
      return sum + pending
    }, 0)
  const totalProfit = repairs
    .filter((r) => r.status === "entregado")
    .reduce((sum, repair) => {
      const charged = Number(repair.cost) || 0
      const partsCost = (repair.serviceItems || []).reduce(
        (servicesSum, service) => servicesSum + (Number(service.pieceCost) || 0),
        0,
      )
      return sum + Math.max(0, charged - partsCost)
    }, 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Recepción y Gestión de Reparaciones
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Control de taller, ordenes de servicio por estados y cobro directo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setIsHistoryOpen(true)} className="gap-2 text-xs">
            <History className="h-4 w-4" />
            Historial de reparaciones
          </Button>
        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Recibidos</p>
              <p className="text-lg font-black text-blue-600">{countRecibido}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-950/40">
              <Clock className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Entregados</p>
              <p className="text-lg font-black text-purple-600">{countEntregado}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center dark:bg-purple-950/40">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">No resultó</p>
              <p className="text-lg font-black text-rose-600">{countNoResulto}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center dark:bg-rose-950/40">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">En Reparación</p>
              <p className="text-lg font-black text-amber-600">{countDiagnostico}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center dark:bg-amber-950/40">
              <Wrench className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Esp. Repuesto</p>
              <p className="text-lg font-black text-orange-600">{countRepuesto}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center dark:bg-orange-950/40">
              <Package className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Listos para Entrega</p>
              <p className="text-lg font-black text-emerald-600">{countListo}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center dark:bg-emerald-950/40">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Por Cobrar en Taller</p>
              <p className="text-lg font-black text-rose-600">RD$ {totalPendingMoney.toLocaleString("es-DO")}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center dark:bg-rose-950/40">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500">Ganancia facturada</p>
              <p className="text-lg font-black text-teal-600">RD$ {totalProfit.toLocaleString("es-DO")}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center dark:bg-teal-950/40">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print preview dialog */}
      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="w-[95vw] max-w-[420px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Vista previa de impresión</DialogTitle>
            <DialogDescription>
              Revisa cómo se verá antes de imprimir. Presiona "Imprimir" para confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 min-w-0 overflow-hidden">
            {printType === "sticker" && printRepair && (
              <div className="mx-auto">
                <RepairStickerPrint repair={printRepair} />
              </div>
            )}
            {printType === "ticket" && printRepair && (
              <div className="mx-auto">
                <RepairTicketPrint repair={printRepair} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPrintPreview(false)}>Cancelar</Button>
            <Button onClick={handleConfirmPrint}>Imprimir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por cliente, IMEI, equipo, N° ticket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {WORKFLOW_STATES.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStatus(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedStatus === st.id
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Repairs List */}
      {filteredRepairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white py-16 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 mb-3">
            <Wrench className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">No hay reparaciones en esta vista</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm text-center">
            {search
              ? "No se encontraron coincidencias para tu búsqueda."
              : "Registra la primera orden de recepción de equipo para iniciar el seguimiento."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepairs.map((repair) => {
            const isFinalized = isTerminalRepairStatus(repair.status)
            const totalCost = Number(repair.cost) || 0
            const depositAmt = Number(repair.deposit) || 0
            const pendingAmt = repair.pendingBalance !== undefined ? Number(repair.pendingBalance) : Math.max(0, totalCost - depositAmt)

            return (
              <Card
                key={repair.id}
                className="self-start h-fit border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <CardHeader className="p-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded dark:bg-blue-950/60 font-mono">
                        {repair.repair_number ? `#${repair.repair_number}` : ""}
                        </span>
                        {(repair.createdAt || repair.date) && (
                          <span
                            className="flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400"
                            title={repair.createdAt ? "Fecha de creación" : "Fecha de entrada"}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {repair.createdAt
                              ? new Intl.DateTimeFormat("es-DO", { dateStyle: "short", timeStyle: "short" }).format(
                                  new Date(repair.createdAt),
                                )
                              : new Date(repair.date).toLocaleDateString("es-DO")}
                          </span>
                        )}
                        {getPhoneForRepair(repair, customers) && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-gray-500 dark:text-gray-400" title="Teléfono del cliente">
                            <Phone className="h-3 w-3" />
                            {getPhoneForRepair(repair, customers)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-1 flex items-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-gray-500" />
                        {formatDeviceName(repair.brand, repair.model, repair.device)}
                      </h3>
                    </div>

                    {/* Change Status Dropdown */}
                    <Select
                      value={repair.status || "recibido"}
                      disabled={!canEditRepairs || isFinalized}
                      onValueChange={(val) => handleStatusChange(repair.id, val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] font-bold px-2 w-auto border-none shadow-none bg-gray-100 dark:bg-gray-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_STATES.slice(1).map((st) => (
                          <SelectItem key={st.id} value={st.id} className="text-xs font-bold">
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>

                <CardContent className="p-3 pb-0 space-y-2 text-xs">
                  {/* Cliente Info */}
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        {repair.client}
                      </span>
                    </div>
                  </div>

                  {/* Falla & IMEI */}
                  <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/60 space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white line-clamp-2">
                      <span className="text-gray-400">Falla:</span> {repair.issue}
                    </p>
                    {repair.imei && (
                      <p className="text-[10px] font-mono text-gray-500">
                        IMEI: {repair.imei}
                      </p>
                    )}
                    {repair.type && (
                      <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        Servicio: {repair.type}
                      </p>
                    )}

                    {(repair.createdByEmployeeName || repair.statusHistory?.length) && (
                      <div className="mt-2 rounded-lg bg-gray-100 p-2 text-[10px] text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                        {repair.createdByEmployeeName && (
                          <p>
                            Registrado por <span className="font-semibold text-gray-900 dark:text-white">{repair.createdByEmployeeName}</span>
                            {repair.createdAt ? ` el ${new Date(repair.createdAt).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}` : ""}
                          </p>
                        )}
                        {repair.statusHistory && repair.statusHistory.length > 0 && (
                          <p>
                            Último cambio: <span className="font-semibold text-gray-900 dark:text-white">{repair.statusHistory[repair.statusHistory.length - 1].toStatus}</span>
                            {repair.statusHistory[repair.statusHistory.length - 1].changedByEmployeeName
                              ? ` por ${repair.statusHistory[repair.statusHistory.length - 1].changedByEmployeeName}`
                              : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Finances */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-gray-100 dark:border-gray-800">
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold">Costo Total</p>
                      <p className="font-bold text-gray-900 dark:text-white">
                        RD$ {totalCost.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold">Abono</p>
                      <p className="font-bold text-emerald-600">
                        RD$ {depositAmt.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold">Saldo</p>
                      <p className="font-bold text-rose-600">
                        RD$ {pendingAmt.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>

                {/* Card Actions */}
                <div className="p-2 pt-0 border-t border-gray-100 dark:border-gray-800 mt-0">
                  <div className="grid grid-cols-4 gap-1.5 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleNotifyWhatsapp(repair)}
                      title="Notificar por WhatsApp"
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span className="truncate">WhatsApp</span>
                    </Button>

                    {!isFinalized && canAddRepairs && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        onClick={() => {
                          setSelectedFaultRepair(repair)
                          setIsUnexpectedFaultOpen(true)
                        }}
                        title="Informar Falla Inesperada / Desglose al Cliente"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span className="truncate">Añadir</span>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-blue-600 hover:bg-blue-50"
                      onClick={() => handleTriggerPrint(repair, "ticket")}
                      title="Imprimir Recibo"
                    >
                      <Printer className="h-4 w-4" />
                      <span className="truncate">Recibo</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-gray-600 hover:bg-gray-100"
                      onClick={() => handleTriggerPrint(repair, "sticker")}
                      title="Imprimir Etiqueta Sticker"
                    >
                      <QrCode className="h-4 w-4" />
                      <span className="truncate">Etiqueta</span>
                    </Button>

                    {!isFinalized && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] font-bold text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                        onClick={() => handleConvertToInvoice(repair)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate">Facturar</span>
                      </Button>
                    )}

                    {isFinalized && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] font-bold text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                        onClick={() => handleReturnToReceived(repair.id)}
                        title="Regresar a recibido"
                      >
                        <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                        <span className="truncate">Regresar</span>
                      </Button>
                    )}

                    {canEditRepairs && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-orange-600 hover:bg-orange-50"
                        onClick={() => handleOpenNotes(repair)}
                        title="Agregar notas del técnico"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate">Agregar notas</span>
                      </Button>
                    )}

                    {!isFinalized && canEditRepairs && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-gray-500 hover:text-gray-900"
                        onClick={() => handleEdit(repair)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        <span className="truncate">Editar</span>
                      </Button>
                    )}

                    {!isFinalized && canDeleteRepairs && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[9px] text-rose-500 hover:bg-rose-50"
                        onClick={() => handleDelete(repair.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="truncate">Eliminar</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Repair Reception Dialog Modal */}
      <RepairDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setPrefillRepair(null)
        }}
        editingRepair={editingRepair}
        prefillRepair={prefillRepair}
      />

      <RepairHistoryDialog
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        history={repairHistory}
        onUseCustomer={handleUseHistory}
      />

      {/* Unexpected Fault Notification Modal */}
      <Dialog open={Boolean(notesRepair)} onOpenChange={(open) => { if (!open) setNotesRepair(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notas del técnico</DialogTitle>
            <DialogDescription>
              Registra fallas encontradas, diagnósticos o si el teléfono no tiene solución.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Textarea
              autoFocus
              rows={6}
              placeholder="Ej: Se encontró daño en la placa. No es posible reparar el equipo..."
              value={technicianNotes}
              onChange={(event) => setTechnicianNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesRepair(null)}>Cancelar</Button>
            <Button onClick={handleSaveNotes} disabled={isSavingNotes}>
              {isSavingNotes ? "Guardando..." : "Guardar notas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScanDetailsDialog} onOpenChange={handleCloseScanDetails}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-600" />
              Información de la orden {scanRepair?.repair_number || ""}
            </DialogTitle>
            <DialogDescription>
              Datos de recepción para que el técnico pueda revisar el equipo.
            </DialogDescription>
          </DialogHeader>

          {scanRepair && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3">
              <span className="text-sm font-semibold text-slate-700">Estado de la orden</span>
              <Select
                value={scanRepair.status || "recibido"}
                disabled={isTerminalRepairStatus(scanRepair.status)}
                onValueChange={(value) => handleStatusChange(scanRepair.id, value)}
              >
                <SelectTrigger className="w-[210px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_STATES.slice(1).map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scanDetails && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Cliente</p>
                  <p className="font-medium">{scanDetails.client}</p>
                  <p className="text-xs text-muted-foreground">{scanDetails.phone}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Datos del Teléfono</p>
                  <p className="font-medium">{scanDetails.device}</p>
                  <p className="text-xs text-muted-foreground">IMEI: {scanDetails.imei}</p>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Seguridad de desbloqueo</p>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <p><span className="font-medium">Contraseña:</span> {scanDetails.password}</p>
                  <p><span className="font-medium">Patrón:</span> {scanDetails.unlockPattern}</p>
                </div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-800">Falla reportada por el cliente</p>
                <p className="mt-1 whitespace-pre-wrap">{scanDetails.issue}</p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-800">Servicio a ofrecer</p>
                <p className="mt-1 whitespace-pre-wrap">{scanDetails.service}</p>
              </div>

              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <p className="text-xs font-semibold text-purple-800">Observaciones Visuales</p>
                <p className="mt-1 whitespace-pre-wrap">{scanDetails.visualNotes}</p>
              </div>

              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                <p className="text-xs font-semibold text-cyan-800">Fotografías del Estado Físico</p>
                {scanPhotoUrls.length > 0 ? (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {scanPhotoUrls.map((url, index) => (
                      <img key={url} src={url} alt={`Foto del equipo ${index + 1}`} className="h-28 w-full rounded-lg object-cover border border-cyan-200" />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">No hay fotografías capturadas.</p>
                )}
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-800">Checklist de Recepción (Inspección Física)</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(scanDetails.checklist).length > 0 ? Object.entries(scanDetails.checklist).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded border bg-white/70 px-2 py-1.5">
                      <span className="capitalize">{key.replace(/[_-]/g, " ")}</span>
                      <Badge variant={value === "si" ? "default" : "outline"}>{String(value)}</Badge>
                    </div>
                  )) : <p className="text-muted-foreground">No hay checklist registrado.</p>}
                </div>
              </div>

              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-orange-800">Agregar notas</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{scanDetails.technicianNotes}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => scanRepair && handleOpenNotes(scanRepair)}>
                    Agregar notas
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseScanDetails(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unexpected Fault Notification Modal */}
      <UnexpectedFaultDialog
        open={isUnexpectedFaultOpen}
        onOpenChange={setIsUnexpectedFaultOpen}
        repair={selectedFaultRepair}
      />

      {/* Print View Container */}
      {printRepair && printType && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-4">
          {printType === "ticket" ? (
            <RepairTicketPrint repair={printRepair} />
          ) : (
            <RepairStickerPrint repair={printRepair} />
          )}
        </div>
      )}
    </div>
  )
}
