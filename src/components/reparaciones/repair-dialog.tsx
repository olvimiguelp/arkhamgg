"use client"

import React, { useRef, useState, useEffect } from "react"
import { useStore, type Repair, type Customer } from "@/components/store-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PatternLock } from "./pattern-lock"
import {
  RepairTicketPrint,
  RepairStickerPrint,
  printRepairTicketDirect,
  printRepairStickerDirect,
} from "./repair-print-templates"
import { useToast } from "@/hooks/use-toast"
import { useNavigate } from "react-router-dom"
import { sendWhatsappBotMessage } from "@/lib/whatsapp-bot"
import { getPhoneForRepair, formatDeviceName } from "@/lib/repair-utils"
import { getTenantBranding } from "@/lib/tenant-branding"
import {
  deleteRepairPhoto,
  getRepairPhotoUrl,
  uploadRepairPhoto,
  type RepairPhoto,
} from "@/lib/repair-photo-storage"
import { UnexpectedFaultDialog } from "./unexpected-fault-dialog"
import {
  User,
  Smartphone,
  Wrench,
  DollarSign,
  Printer,
  QrCode,
  MessageSquare,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Search,
  Shield,
  Phone,
  Eye,
  Camera,
  RotateCw,
  ClipboardCheck,
  Upload,
  Plus,
  Trash2,
} from "lucide-react"

interface RepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingRepair?: Repair | null
  onSaved?: () => void
  prefillRepair?: Partial<Repair> | null
}

const COMMON_BRANDS = [
  "Samsung",
  "Apple / iPhone",
  "Xiaomi / Redmi",
  "Motorola",
  "Infinix",
  "TECNO",
  "Huawei",
  "Honor",
  "ZTE",
  "Alcatel",
  "LG",
  "Google Pixel",
  "Otro",
]

const COMMON_SERVICES = [
  "Cambio de Pantalla",
  "Cambio de Batería",
  "Cambio de Centro de Carga / Pin",
  "Limpieza y Desulfatación (Moja)",
  "Reballing / Reparación de Placa",
  "Software Flasheo / Desbloqueo",
  "Cambio de Tapa Trasera",
  "Cambio de Módulo de Cámara",
  "Cambio de Bocina",
  "Trabajo de Chip",
  "Mantenimiento General",
  "Otro Servicio",
]

const CHECKLIST_ITEMS = [
  { id: "enciende", label: "¿Enciende?", sublabel: "Muestra actividad al pulsar encendido" },
  { id: "pantalla_imagen", label: "¿Pantalla con imagen?", sublabel: "Visualiza logo/sistema sin manchas" },
  { id: "tactil_funcional", label: "¿Táctil funcional?", sublabel: "Responde en toda la superficie" },
  { id: "camaras", label: "¿Cámaras funcionando?", sublabel: "Frontal y trasera capturan imagen" },
  { id: "auricular_altavoz", label: "¿Auricular y Altavoz?", sublabel: "Sonido de llamada y multimedia" },
  { id: "carga_bateria", label: "¿Carga batería?", sublabel: "Detecta cable y sube porcentaje" },
  { id: "sim_wifi", label: "¿Lector SIM / WiFi?", sublabel: "Reconoce chip y redes inalámbricas" },
  { id: "tapa_marco_danado", label: "¿Tapa/Marco conservado?", sublabel: "Sin grietas ni abolladuras graves" },
]

const ISSUE_PRESETS = [
  "Pantalla rota / sin imagen",
  "No enciende",
  "No carga / pin dañado",
  "Mojado / Caído al agua",
  "Táctil no responde",
  "Batería dura muy poco / Hinchada",
  "Sin señal celular / No lee SIM",
  "Auricular o micrófono no se escucha",
  "Cámara borrosa / cristal roto",
]

const VISUAL_PRESETS = [
  "Tapa trasera rota en esquina",
  "Marco lateral con raspones profundos",
  "Vidrio de pantalla astillado",
  "Lente de cámara rayado",
  "Falta botón de volumen/encendido",
  "Pantalla con manchas o líneas",
  "Tapa con pegamento / abierta previamente",
]

type ServiceDetail = {
  pieceCost: string
  charge: string
}

export function RepairDialog({
  open,
  onOpenChange,
  editingRepair,
  onSaved,
  prefillRepair,
}: RepairDialogProps) {
  const { customers, repairs, repairHistory, employees, addRepair, updateRepair, addToCart, currentUser, refreshData } = useStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isFinalizedRepair = Boolean(
    editingRepair &&
      ["entregado", "no_resulto"].includes(
        repairs.find((repair) => repair.id === editingRepair.id)?.status || editingRepair.status,
      ),
  )

  const [activeTab, setActiveTab] = useState("general")

  // Form State
  const [clientSearch, setClientSearch] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("")
  const [clientName, setClientName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [cedula, setCedula] = useState("")

  const [brand, setBrand] = useState("Samsung")
  const [model, setModel] = useState("")
  const [imei, setImei] = useState("")
  const [color, setColor] = useState("")
  const [unlockPattern, setUnlockPattern] = useState("")
  const [unlockType, setUnlockType] = useState<"pattern" | "pin" | "none">("pattern")

  const [issue, setIssue] = useState("")
  const [visualNotes, setVisualNotes] = useState("")
  const [checklist, setChecklist] = useState<Record<string, "si" | "no" | "no_probado">>({
    enciende: "si",
    pantalla_imagen: "si",
    tactil_funcional: "si",
    camaras: "si",
    auricular_altavoz: "si",
    carga_bateria: "si",
    sim_wifi: "si",
    tapa_marco_danado: "si",
  })

  const [photos, setPhotos] = useState<string[]>([])
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [storedPhotos, setStoredPhotos] = useState<Array<RepairPhoto & { url: string }>>([])
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const cameraInputRef = React.useRef<HTMLInputElement>(null)
  const galleryInputRef = React.useRef<HTMLInputElement>(null)

  const handleAddIssuePreset = (preset: string) => {
    setIssue((prev) => (prev ? `${prev}, ${preset}` : preset))
  }

  const handleAddVisualPreset = (preset: string) => {
    setVisualNotes((prev) => (prev ? `${prev}, ${preset}` : preset))
  }

  const handleMarkAllChecklist = (status: "si" | "no_probado") => {
    const updated: Record<string, "si" | "no" | "no_probado"> = {}
    CHECKLIST_ITEMS.forEach((item) => {
      updated[item.id] = status
    })
    setChecklist(updated)
  }

  const [isWebcamOpen, setIsWebcamOpen] = useState(false)
  const [webcamFacing, setWebcamFacing] = useState<"environment" | "user">("environment")
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsWebcamOpen(false)
  }

  const startWebcam = async (facing: "environment" | "user" = webcamFacing) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraInputRef.current?.click()
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      setWebcamFacing(facing)
      setIsWebcamOpen(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 150)
    } catch (err) {
      console.warn("Unable to access live webcam, falling back to file input", err)
      toast({
        title: "Iniciando captura de cámara...",
        description: "Si la cámara en vivo no se abre, use el selector de imágenes.",
      })
      cameraInputRef.current?.click()
    }
  }

  const captureWebcamPhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" })
        setPhotoFiles((prev) => [...prev, file])
        const dataUrl = canvas.toDataURL("image/jpeg")
        setPhotos((prev) => [...prev, dataUrl])
        toast({ title: "Foto capturada" })
      },
      "image/jpeg",
      0.88
    )
  }

  useEffect(() => {
    if (!open) {
      stopWebcam()
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const files = Array.from(e.target.files)
    setPhotoFiles((prev) => [...prev, ...files])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotos((prev) => [...prev, event.target!.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleRemovePhoto = async (index: number) => {
    if (index < storedPhotos.length) {
      const photo = storedPhotos[index]
      try {
        await deleteRepairPhoto(photo)
        setStoredPhotos((prev) => prev.filter((item) => item.id !== photo.id))
        setPhotos((prev) => prev.filter((_, i) => i !== index))
      } catch (error: any) {
        toast({ title: "No se pudo eliminar la imagen", description: error.message, variant: "destructive" })
      }
      return
    }
    const newIndex = index - storedPhotos.length
    setPhotoFiles((prev) => prev.filter((_, i) => i !== newIndex))
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const functionalCount = Object.values(checklist).filter((val) => val === "si").length

  const [serviceType, setServiceType] = useState("Otro Servicio")
  const [customServiceType, setCustomServiceType] = useState("")
  const [cost, setCost] = useState("")
  const [deposit, setDeposit] = useState("")
  const [technician, setTechnician] = useState("")
  const [serviceDetails, setServiceDetails] = useState<Record<string, ServiceDetail>>({})
  const [serviceDraft, setServiceDraft] = useState("")

  const [isUnexpectedFaultOpen, setIsUnexpectedFaultOpen] = useState(false)

  const handleApplyUnexpectedFault = (updatedService: string, newTotalCost: number, unexpectedNote: string) => {
    setServiceType("Otro Servicio")
    setCustomServiceType(updatedService)
    setCost(newTotalCost.toString())
    setIssue((prev) => (prev ? `${prev}\n${unexpectedNote}` : unexpectedNote))
  }

  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)

  // Mode for Printing
  const [printMode, setPrintMode] = useState<"ticket" | "sticker" | null>(null)
  const [createdRepairData, setCreatedRepairData] = useState<Partial<Repair> | null>(null)

  // Pre-fill form when editing an existing repair
  useEffect(() => {
    if (editingRepair) {
      setClientName(editingRepair.client || "")
      const resolvedPhone = editingRepair.customerPhone || editingRepair.whatsapp || getPhoneForRepair(editingRepair, customers)
      setCustomerPhone(resolvedPhone || "")
      setWhatsapp(editingRepair.whatsapp || editingRepair.customerPhone || resolvedPhone || "")
      setCedula(editingRepair.cedula || "")

      setBrand(editingRepair.brand || "Samsung")
      setModel(editingRepair.model || "")
      setImei(editingRepair.imei || "")
      setColor(editingRepair.color || "")
      const passVal = editingRepair.unlockPattern || editingRepair.password || ""
      setUnlockPattern(passVal)
      if (!passVal) {
        setUnlockType("none")
      } else if (passVal.includes("-")) {
        setUnlockType("pattern")
      } else {
        setUnlockType("pin")
      }

      setIssue(editingRepair.issue || "")
      setVisualNotes(editingRepair.visualNotes || "")
      if (editingRepair.checklist) {
        setChecklist(editingRepair.checklist)
      }

      const savedServiceType = editingRepair.type || ""
      setServiceType("Otro Servicio")
      setCustomServiceType(savedServiceType)
      setCost(editingRepair.cost || "0")
      setServiceDetails(
        (editingRepair.serviceItems || []).reduce<Record<string, ServiceDetail>>((details, item) => {
          details[item.name] = {
            pieceCost: String(item.pieceCost ?? 0),
            charge: String(item.charge ?? 0),
          }
          return details
        }, {}),
      )
      setDeposit(editingRepair.deposit ? String(editingRepair.deposit) : "0")
      setTechnician(editingRepair.technician || "")
      setPhotoFiles([])
      setStoredPhotos([])
      setPhotos([])
      let cancelled = false
      void Promise.allSettled((editingRepair.photos || []).map(async (photo) => ({
        ...photo,
        url: await getRepairPhotoUrl(photo.storagePath),
      }))).then((results) => {
        if (cancelled) return
        const loadedPhotos = results
          .filter((result): result is PromiseFulfilledResult<RepairPhoto & { url: string }> => result.status === "fulfilled")
          .map((result) => result.value)
        const failedCount = results.filter((result) => result.status === "rejected").length
        setStoredPhotos(loadedPhotos)
        setPhotos(loadedPhotos.map((photo) => photo.url))
        if (failedCount > 0) console.warn(`No se pudieron cargar ${failedCount} foto(s) de la reparación.`)
      }).catch((error) => console.warn("No se pudieron cargar las fotos de la reparación:", error))
      return () => { cancelled = true }
    } else if (prefillRepair) {
      setClientSearch("")
      setSelectedCustomerId("")
      setClientName(prefillRepair.client || "")
      setCustomerPhone(prefillRepair.customerPhone || prefillRepair.whatsapp || "")
      setWhatsapp(prefillRepair.whatsapp || prefillRepair.customerPhone || "")
      setCedula(prefillRepair.cedula || "")
      setBrand(prefillRepair.brand || "Samsung")
      setModel(prefillRepair.model || "")
      setImei(prefillRepair.imei || "")
      setColor(prefillRepair.color || "")
      setIssue(prefillRepair.issue || "")
      setVisualNotes(prefillRepair.visualNotes || "")
      setActiveTab("general")
    } else {
      resetForm()
    }
  }, [editingRepair, open, prefillRepair])

  const resetForm = () => {
    setClientSearch("")
    setSelectedCustomerId("")
    setClientName("")
    setCustomerPhone("")
    setWhatsapp("")
    setCedula("")

    setBrand("Samsung")
    setModel("")
    setImei("")
    setColor("")
    setUnlockPattern("")
    setUnlockType("pattern")

    setIssue("")
    setVisualNotes("")
    setChecklist({
      enciende: "si",
      pantalla_imagen: "si",
      tactil_funcional: "si",
      camaras: "si",
      auricular_altavoz: "si",
      carga_bateria: "si",
      sim_wifi: "si",
      tapa_marco_danado: "no",
    })

    setServiceType("Otro Servicio")
    setCustomServiceType("")
    setCost("")
    setDeposit("")
    setTechnician("")
    setServiceDetails({})
    setServiceDraft("")
    setActiveTab("general")
    setPrintMode(null)
    setCreatedRepairData(null)
    setPhotos([])
    setPhotoFiles([])
    setStoredPhotos([])
  }

  // Handle selecting an existing customer from autocomplete search
  const handleSelectCustomer = (customer: Pick<Customer, "id" | "name" | "phone" | "cedula">) => {
    setSelectedCustomerId(customer.id)
    setClientName(customer.name)
    setCustomerPhone(customer.phone)
    setWhatsapp(customer.phone)
    setCedula(customer.cedula)
    setClientSearch("")
    toast({
      title: "Cliente seleccionado",
      description: `${customer.name} - ${customer.phone}`,
    })
  }

  // Calculate pending balance
  const estimatedCostNum = Number(cost) || 0
  const depositNum = Number(deposit) || 0
  const pendingBalance = Math.max(0, estimatedCostNum - depositNum)

  const finalServiceType = serviceType === "Otro Servicio" ? customServiceType : serviceType
  const offeredServiceNames = Array.from(
    new Set(finalServiceType.split(",").map((service) => service.trim()).filter(Boolean)),
  )

  const addOfferedService = (serviceName: string) => {
    const normalizedName = serviceName.trim()
    if (!normalizedName) return
    const services = offeredServiceNames.includes(normalizedName)
      ? offeredServiceNames
      : [...offeredServiceNames, normalizedName]
    setServiceType("Otro Servicio")
    setCustomServiceType(services.join(", "))
    setServiceDraft("")
  }

  const removeOfferedService = (serviceName: string) => {
    const services = offeredServiceNames.filter((service) => service !== serviceName)
    setServiceType("Otro Servicio")
    setCustomServiceType(services.join(", "))
  }
  const totalServiceCharge = offeredServiceNames.reduce(
    (total, service) => total + (Number(serviceDetails[service]?.charge) || 0),
    0,
  )

  useEffect(() => {
    if (offeredServiceNames.length > 0) {
      setCost(totalServiceCharge.toString())
    } else {
      setCost("0")
    }
  }, [finalServiceType, serviceDetails])

  const buildRepairPayload = () => {
    const fullDeviceName = formatDeviceName(brand, model)
    return {
      client: clientName.trim() || "Cliente General",
      customerPhone: customerPhone.trim(),
      whatsapp: whatsapp.trim() || customerPhone.trim(),
      cedula: cedula.trim(),
      device: fullDeviceName,
      brand,
      model: model.trim(),
      imei: imei.trim(),
      color: color.trim(),
      password: unlockPattern,
      unlockPattern,
      issue: issue.trim() || "Diagnóstico / Reparación general",
      visualNotes: visualNotes.trim(),
      checklist,
      type: finalServiceType,
      cost: estimatedCostNum.toString(),
      deposit: depositNum,
      pendingBalance,
      technician: technician.trim(),
      serviceItems: offeredServiceNames.map((name) => ({
        name,
        pieceCost: Number(serviceDetails[name]?.pieceCost) || 0,
        charge: Number(serviceDetails[name]?.charge) || 0,
      })),
      status: editingRepair ? editingRepair.status : "recibido",
    }
  }

  const handleSave = async (andPrintTicket = false) => {
    // State updates are asynchronous, so this ref also blocks a second rapid
    // click before the disabled state is rendered.
    if (isSubmittingRef.current) return

    if (isFinalizedRepair) {
      toast({
        title: "Orden bloqueada",
        description: "Una orden entregada y facturada no se puede editar.",
        variant: "destructive",
      })
      return
    }

    if (!clientName.trim()) {
      toast({
        title: "Campo requerido",
        description: "Por favor ingresa el nombre del cliente.",
        variant: "destructive",
      })
      setActiveTab("general")
      return
    }

    try {
      isSubmittingRef.current = true
      setIsSubmitting(true)
      const payload = buildRepairPayload()

      let savedRepairId = editingRepair?.id || ""
      if (editingRepair) {
        await updateRepair(editingRepair.id, payload)
        toast({
          title: "Reparación actualizada",
          description: "La orden de reparación ha sido modificada con éxito.",
        })
        setCreatedRepairData({ ...editingRepair, ...payload })
      } else {
        savedRepairId = await addRepair(payload)
        toast({
          title: "Orden Creada",
          description: "Se ha registrado la orden. El cliente no se agregó a Gestión de clientes.",
        })
        setCreatedRepairData({ ...payload, date: new Date().toISOString() })
      }

      if (photoFiles.length > 0) {
        const ownerAdminId = currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || ""
        await Promise.all(photoFiles.map((file) => uploadRepairPhoto(ownerAdminId, savedRepairId, file)))
        await refreshData()
      }

      if (andPrintTicket) {
        setPrintMode("ticket")
        const targetData = editingRepair ? { ...editingRepair, ...payload } : { ...payload, date: new Date().toISOString() }
        await printRepairTicketDirect(
          targetData,
          undefined,
          undefined,
          undefined,
          currentUser?.ownerAdminId || currentUser?.adminId || currentUser?.id,
        )
        onOpenChange(false)
        if (onSaved) onSaved()
      } else {
        onOpenChange(false)
        if (onSaved) onSaved()
      }
    } catch (err: any) {
      toast({
        title: "Error al guardar",
        description: err.message || "No se pudo guardar la reparación.",
        variant: "destructive",
      })
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const handleNotifyWhatsapp = async () => {
    const rawPhone = whatsapp || customerPhone || (editingRepair ? getPhoneForRepair(editingRepair, customers) : getPhoneForRepair({ client: clientName } as any, customers))
    const targetPhone = rawPhone.replace(/\D/g, "")

    if (!targetPhone) {
      toast({
        title: "Sin número de WhatsApp",
        description: "Ingresa un número de teléfono para enviar la notificación.",
        variant: "destructive",
      })
      return
    }

    const ticketNumber = editingRepair?.repair_number || createdRepairData?.repair_number || "Orden Taller"
    const deviceFull = formatDeviceName(brand, model, createdRepairData?.device || editingRepair?.device) || "su equipo"
    const deviceWithColor = color.trim() ? `${deviceFull} (${color.trim()})` : deviceFull
    const imeiLine = imei.trim() ? `IMEI: ${imei.trim()}\n` : ""
    const formatWhatsappAmount = (amount: number) => `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    const formattedCost = formatWhatsappAmount(estimatedCostNum)
    const formattedDeposit = formatWhatsappAmount(depositNum)
    const formattedPending = formatWhatsappAmount(pendingBalance)

    const branding = await getTenantBranding(currentUser?.ownerAdminId)
    const companyName = (branding.businessName || "ARKHAM").toUpperCase()

    const message = `🛠️ ${companyName} - RECEPCIÓN DE EQUIPO\n\nEstimado/a ${clientName || "Cliente"}, confirmamos el ingreso de su equipo a nuestro taller:\n\nOrden N°: ${ticketNumber}\nEquipo: ${deviceWithColor}\n${imeiLine}Falla Reportada: ${issue || "Diagnóstico / Revisión"}\nServicio a Realizar: ${finalServiceType || "Reparación General"}\nPresupuesto Estimado: ${formattedCost}\nAbono Recibido: ${formattedDeposit}\nSaldo Pendiente: ${formattedPending}\n\nGracias por preferirnos.`

    const res = await sendWhatsappBotMessage({
      phone: targetPhone,
      message,
      name: clientName,
      repairNumber: String(ticketNumber),
    })

    if (res.usedBot) {
      toast({
        title: "Enviado por WhatsApp Bot",
        description: `Confirmación enviada automáticamente a ${clientName} (${targetPhone}).`,
      })
    } else {
      toast({
        title: "Abriendo WhatsApp",
        description: "Se abrió el enlace para enviar el mensaje por WhatsApp.",
      })
    }
  }

  const handleConvertToInvoice = async () => {
    if (!editingRepair || isFinalizedRepair) {
      toast({
        title: "Orden bloqueada",
        description: "Una orden entregada y facturada no se puede volver a facturar.",
        variant: "destructive",
      })
      return
    }

    // Pass repair details to checkout cart and navigate to sales
    const serviceChargeTotal = offeredServiceNames.reduce(
      (sum, service) => sum + (Number(serviceDetails[service]?.charge) || 0),
      0,
    ) || estimatedCostNum
    const deviceName = formatDeviceName(brand, model, editingRepair?.device)
    const repairItems = offeredServiceNames.map((service, index) => {
      const serviceCharge = Number(serviceDetails[service]?.charge) || 0
      const lineTotal = pendingBalance > 0 && serviceChargeTotal > 0
        ? pendingBalance * (serviceCharge / serviceChargeTotal)
        : serviceCharge
      return {
        id: `repair-${Date.now()}-${index}`,
        cartId: `repair-${Date.now()}-${index}`,
        sku: "REP-001",
        name: `${deviceName} (${service})`,
        category: "Reparaciones",
        stock: 1,
        minStock: 0,
        buyPrice: Number(serviceDetails[service]?.pieceCost) || 0,
        wholesalePrice: serviceCharge,
        sellPrice: lineTotal,
        customPrice: lineTotal,
        quantity: 1,
        supplier: "Taller Interno",
        sourceTable: "manual" as const,
        sourceId: editingRepair?.id ? `${editingRepair.id}-${index}` : `rep-${Date.now()}-${index}`,
      }
    })

    try {
      await updateRepair(editingRepair.id, { status: "entregado" })
      repairItems.forEach((item) => addToCart(item))
      toast({
        title: "Orden enviada a facturaciÃ³n",
        description: `La orden quedÃ³ en Entregado y Facturado. Saldo cargado: RD$ ${pendingBalance}.`,
      })
      onOpenChange(false)
      navigate("/ventas")
    } catch (err: unknown) {
      toast({
        title: "Error al facturar",
        description: err instanceof Error ? err.message : "No se pudo cerrar la orden de reparaciÃ³n.",
        variant: "destructive",
      })
    }
  }

  const normalizeCustomerSearch = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()

  // El buscador de reparaciones es independiente de la tabla general de
  // Clientes: solo usa personas que ya tienen una reparación registrada.
  const repairClients = Array.from(
    [...repairs, ...repairHistory].reduce((clients, repair) => {
      const key = (repair.customerPhone || repair.whatsapp || repair.cedula || repair.client || "").replace(/\D/g, "") || repair.client.toLowerCase().trim()
      if (!clients.has(key)) {
        clients.set(key, {
          id: repair.id,
          name: repair.client || "Cliente",
          phone: repair.customerPhone || repair.whatsapp || "",
          cedula: repair.cedula || "",
        })
      }
      return clients
    }, new Map<string, Pick<Customer, "id" | "name" | "phone" | "cedula">>()).values(),
  )

  const normalizedClientSearch = normalizeCustomerSearch(clientSearch)
  const normalizedClientSearchDigits = clientSearch.replace(/\D/g, "")
  const filteredCustomers = normalizedClientSearch
    ? repairClients
        .filter((c) => {
          const matchesText = [c.name, c.cedula, c.phone]
            .map(normalizeCustomerSearch)
            .some((value) => value.includes(normalizedClientSearch))
          const matchesDigits = normalizedClientSearchDigits.length > 0 && [c.cedula, c.phone]
            .map((value) => value.replace(/\D/g, ""))
            .some((value) => value.includes(normalizedClientSearchDigits))

          return matchesText || matchesDigits
        })
        .slice(0, 8)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[95vw] sm:max-w-none md:w-[85vw] md:max-w-[85vw] h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] sm:h-[95vh] md:h-[90vh] min-h-0 flex flex-col p-0 gap-0 dark:bg-gray-900 border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Screen Reader Header (Accessibility) */}
        <DialogHeader className="sr-only">
          <DialogTitle>
            {editingRepair
              ? `Editar Orden #${editingRepair.repair_number || "Reparación"}`
              : "Recepción de Reparación / Taller"}
          </DialogTitle>
          <DialogDescription>
            {activeTab === "general" && "Fase 1 de 2: Identificación de cliente y detalles del teléfono"}
            {activeTab === "inspection" && "Fase 2 de 2: Inspección, fallas, fotografías y monto a pagar"}
          </DialogDescription>
        </DialogHeader>

        {/* Phase / Step Wizard Bar (Fixed) */}
        <div className="shrink-0 pl-4 pr-12 py-3 bg-gray-100/90 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                activeTab === "general"
                  ? "bg-white text-blue-600 border-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400 dark:border-blue-500 ring-1 ring-blue-500/20"
                  : "bg-white/70 text-gray-700 hover:bg-white dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              <User className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate">👤 Pestaña 1: Cliente y Dispositivo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("inspection")}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                activeTab === "inspection"
                  ? "bg-white text-blue-600 border-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400 dark:border-blue-500 ring-1 ring-blue-500/20"
                  : "bg-white/70 text-gray-700 hover:bg-white dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              <ClipboardCheck className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate">📋 Pestaña 2: Inspección, Falla y Monto a Pagar</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body (Flex-1) */}
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* FASE 1: CLIENTE Y DISPOSITIVO */}
            <TabsContent value="general" className="mt-0 border-none p-0 focus-visible:ring-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* LEFT COLUMN: Datos del Cliente */}
                <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-4">
                  {/* Card Header */}
                  <div className="flex items-center gap-3 pb-1 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Datos del Cliente de Reparación</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Se guarda solo en la orden y en el historial de reparaciones</p>
                    </div>
                  </div>

                  {/* Buscar cliente activo */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Buscar cliente de reparaciones
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-blue-500" />
                      <Input
                        placeholder="Nombre, cédula o teléfono"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="pl-9 text-xs border-blue-200 focus:border-blue-500 focus:ring-blue-500 dark:border-blue-800"
                      />
                    </div>
                    {normalizedClientSearch && (
                      <div className="overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm dark:border-blue-900 dark:bg-gray-900">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => handleSelectCustomer(customer)}
                              className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50 dark:border-gray-800 dark:hover:bg-blue-950/40"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-gray-900 dark:text-white">
                                  {customer.name}
                                </span>
                                <span className="block truncate text-[11px] text-gray-500">
                                  Cédula: {customer.cedula || "N/D"} · Tel: {customer.phone || "N/D"}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Activo
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-xs text-gray-500">
                            No se encontraron clientes con reparaciones registradas.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Nombre Completo */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Nombre Completo <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Ej. Carlos Eduardo Pérez"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Cédula / RUC / Documento */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Cédula / RUC / Documento de Identidad
                    </Label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Ej. 1728394012"
                        value={cedula}
                        onChange={(e) => setCedula(e.target.value)}
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Teléfono de Contacto & WhatsApp */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Teléfono de Contacto <span className="text-rose-500">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Ej. +593 99 123 4567"
                          value={customerPhone}
                          onChange={(e) => {
                            setCustomerPhone(e.target.value)
                            setWhatsapp(e.target.value)
                          }}
                          className="pl-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        WhatsApp Notificaciones <span className="text-emerald-500">*</span>
                      </Label>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
                        <Input
                          placeholder="Ej. +593991234567"
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          className="pl-9 text-xs border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500 dark:border-emerald-800"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Datos del Teléfono */}
                <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-4">
                  {/* Card Header */}
                  <div className="flex items-center gap-3 pb-1 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Datos del Teléfono</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Identificación única del equipo a reparar</p>
                    </div>
                  </div>

                  {/* Marca & Modelo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Marca <span className="text-rose-500">*</span>
                      </Label>
                      <Select value={brand} onValueChange={setBrand}>
                        <SelectTrigger className="text-xs bg-white dark:bg-gray-800">
                          <SelectValue placeholder="-- Seleccionar Marca --" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMON_BRANDS.map((b) => (
                            <SelectItem key={b} value={b} className="text-xs">
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Modelo <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        placeholder="Ej. Galaxy S21 / iPhone 13"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* IMEI & Color */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        IMEI o N° Serie <span className="text-rose-500">*</span> <span className="text-gray-400 font-normal">(Cédula del equipo)</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">#</span>
                        <Input
                          placeholder="15 dígitos IMEI o N° Serie"
                          value={imei}
                          onChange={(e) => setImei(e.target.value)}
                          className="pl-7 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Color del Equipo
                      </Label>
                      <Input
                        placeholder="Ej. Negro Phantom / Azul"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="text-xs"
                      />
                      {/* Preset Colors */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {["Negro", "Blanco", "Azul", "Gris/Plata", "Dorado", "Verde", "Rojo", "Morado"].map((presetColor) => (
                          <button
                            key={presetColor}
                            type="button"
                            onClick={() => setColor(presetColor)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                              color === presetColor
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                            }`}
                          >
                            {presetColor}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Seguridad de Desbloqueo */}
                  <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Seguridad de Desbloqueo <span className="text-gray-500 font-normal">(Necesario para pruebas del técnico)</span>
                    </Label>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="unlockType"
                          checked={unlockType === "pattern"}
                          onChange={() => setUnlockType("pattern")}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Patrón Visual (3x3)</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="unlockType"
                          checked={unlockType === "pin"}
                          onChange={() => setUnlockType("pin")}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>PIN / Clave Alfanumérica</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="unlockType"
                          checked={unlockType === "none"}
                          onChange={() => {
                            setUnlockType("none")
                            setUnlockPattern("")
                          }}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Sin clave / Sin código</span>
                      </label>
                    </div>

                    {unlockType === "pattern" && (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 mt-2 border border-slate-200 dark:border-slate-800 flex justify-center">
                        <PatternLock value={unlockPattern} onChange={setUnlockPattern} />
                      </div>
                    )}

                    {unlockType === "pin" && (
                      <div className="space-y-1 pt-1">
                        <Input
                          type="text"
                          placeholder="Ingrese PIN de 4-6 dígitos o Clave alfanumérica..."
                          value={unlockPattern}
                          onChange={(e) => setUnlockPattern(e.target.value)}
                          className="text-xs font-mono"
                        />
                      </div>
                    )}

                    {unlockType === "none" && (
                      <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 italic">
                        El equipo ingresa sin clave ni patrón de seguridad registrado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* FASE 2: INSPECCIÓN Y FALLA */}
            <TabsContent value="inspection" className="mt-0 border-none p-0 focus-visible:ring-0 space-y-5">
              {/* TOP 2-COLUMN GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* LEFT COLUMN: Falla Reportada + Observaciones Visuales */}
                <div className="space-y-5">
                  {/* CARD 1: Falla Reportada por el Cliente */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Falla Reportada por el Cliente</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Descripción dada por el usuario al entregar</p>
                      </div>
                    </div>

                    <Textarea
                      placeholder="Describa el problema manifestado por el cliente (Ej. No carga, se mojó ayer, la pantalla parpadea...)"
                      rows={3}
                      value={issue}
                      onChange={(e) => setIssue(e.target.value)}
                      className="text-xs bg-white dark:bg-gray-900"
                    />

                    {/* Preset quick tags */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold tracking-wider text-amber-800/80 dark:text-amber-400/80 uppercase">
                        INSERTAR FALLA FRECUENTE RÁPIDO:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ISSUE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleAddIssuePreset(preset)}
                            className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 transition-colors dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: Servicio a ofrecer */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                        <Wrench className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Servicio a ofrecer</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Puedes agregar uno o varios servicios</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        value={serviceDraft}
                        onChange={(event) => setServiceDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            addOfferedService(serviceDraft)
                          }
                        }}
                        placeholder="Escriba un servicio o producto"
                        className="bg-white text-sm dark:bg-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => addOfferedService(serviceDraft)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        title="Agregar servicio"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {offeredServiceNames.map((service) => (
                        <div key={service} className="flex items-center gap-2">
                          <Input value={service} readOnly className="bg-white text-sm dark:bg-gray-900" />
                          <button
                            type="button"
                            onClick={() => removeOfferedService(service)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center text-rose-600 hover:text-rose-700"
                            title={`Quitar ${service}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold tracking-wider text-blue-800/80 dark:text-blue-400/80 uppercase">
                        INSERTAR FALLA FRECUENTE RÁPIDO:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_SERVICES.filter((service) => service !== "Otro Servicio").map((service) => (
                          <button
                            key={service}
                            type="button"
                            onClick={() => addOfferedService(service)}
                            className="rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-[11px] font-medium text-blue-900 hover:bg-blue-100 transition-colors dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                          >
                            + {service}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CARD 3: Observaciones Visuales */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                        <Eye className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Observaciones Visuales</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Daños o desgastes previos del equipo para protección técnica</p>
                      </div>
                    </div>

                    <Textarea
                      placeholder="Detalle rayones, grietas, piezas faltantes o golpes existentes al recibir (Ej. Llega con la tapa trasera rota en la esquina inferior)"
                      rows={3}
                      value={visualNotes}
                      onChange={(e) => setVisualNotes(e.target.value)}
                      className="text-xs bg-white dark:bg-gray-900"
                    />

                    {/* Visual presets */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold tracking-wider text-purple-800/80 dark:text-purple-400/80 uppercase">
                        DAÑOS VISUALES FRECUENTES:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {VISUAL_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleAddVisualPreset(preset)}
                            className="rounded-lg border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-[11px] font-medium text-purple-900 hover:bg-purple-100 transition-colors dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: CARD 3 - Checklist de Recepción */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <ClipboardCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Checklist de Recepción (Inspección Física)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Pruebas iniciales antes de ingresar al taller</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleMarkAllChecklist("si")}
                        className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 transition-colors"
                      >
                        Marcar Todo Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkAllChecklist("no_probado")}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 transition-colors"
                      >
                        Todo No Probado
                      </button>
                    </div>
                  </div>

                  {/* 2-Column Grid of Checklist items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CHECKLIST_ITEMS.map((item) => {
                      const status = checklist[item.id] || "no_probado"
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-emerald-200/80 bg-emerald-50/20 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/10 space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white">{item.label}</h4>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{item.sublabel}</p>
                          </div>

                          {/* Segmented Button Row */}
                          <div className="grid grid-cols-3 gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => setChecklist((prev) => ({ ...prev, [item.id]: "si" }))}
                              className={`flex items-center justify-center gap-1 rounded-lg py-1 px-1.5 text-xs font-bold transition-all ${
                                status === "si"
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                              }`}
                            >
                              <CheckCircle2 className="h-3 w-3" /> Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setChecklist((prev) => ({ ...prev, [item.id]: "no" }))}
                              className={`flex items-center justify-center gap-1 rounded-lg py-1 px-1.5 text-xs font-bold transition-all ${
                                status === "no"
                                  ? "bg-rose-600 text-white shadow-sm"
                                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                              }`}
                            >
                              <X className="h-3 w-3" /> No
                            </button>
                            <button
                              type="button"
                              onClick={() => setChecklist((prev) => ({ ...prev, [item.id]: "no_probado" }))}
                              className={`flex items-center justify-center gap-1 rounded-lg py-1 px-1.5 text-xs font-bold transition-all ${
                                status === "no_probado"
                                  ? "bg-slate-500 text-white shadow-sm"
                                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                              }`}
                            >
                              ❓ N/P
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[11px]">* N/P = No Probado por falta de carga o encendido</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300">{functionalCount} / 8 funcionales</span>
                  </div>
                </div>
              </div>

              {/* BOTTOM FULL-WIDTH CARD: CARD 4 - Fotografías del Estado Físico */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      <Camera className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Fotografías del Estado Físico</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Capture fotos de raspaduras, pantalla rota o estado inicial del equipo</p>
                    </div>
                  </div>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {photos.length} Fotos
                  </span>
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <input
                    type="file"
                    ref={galleryInputRef}
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <Button
                    type="button"
                    onClick={() => startWebcam()}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl h-9 px-4 gap-2"
                  >
                    <Camera className="h-4 w-4" /> Abrir Cámara Live
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => galleryInputRef.current?.click()}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 text-xs font-semibold rounded-xl h-9 px-4 gap-2"
                  >
                    <Upload className="h-4 w-4" /> Subir de Galería / Archivo
                  </Button>
                </div>

                {/* Photo Grid or Empty State */}
                {photos.length === 0 ? (
                  <div
                    onClick={() => startWebcam()}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 py-8 px-4 text-center cursor-pointer hover:bg-gray-100/60 transition-colors"
                  >
                    <div className="rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-gray-800 mb-2">
                      <Camera className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300">No hay imágenes capturadas aún</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Haga clic en "Abrir Cámara Live" para tomar una foto del equipo o suba un archivo.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                    {photos.map((src, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 aspect-square">
                        <button
                          type="button"
                          className="block w-full h-full cursor-zoom-in"
                          onClick={() => setPreviewPhoto(src)}
                          aria-label={`Ampliar foto ${idx + 1}`}
                        >
                          <img src={src} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 shadow hover:bg-rose-700 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTTOM CARD: CARD 5 - Monto a Pagar */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800/80 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Monto a Pagar</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Monto a pagar por la reparación, abono inicial y saldo pendiente</p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsUnexpectedFaultOpen(true)}
                    className="bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300 text-xs font-bold gap-1.5 shadow-sm"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    ⚠️ Notificar Falla Inesperada al Cliente
                  </Button>
                </div>

                {/* Contenedor Financiero / Cálculos */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/60 space-y-3">
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Detalle por servicio</p>
                    {offeredServiceNames.map((service) => (
                      <div key={service} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        <p className="mb-2 text-xs font-bold text-gray-900 dark:text-white">{service}</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-gray-600 dark:text-gray-400">Costo de la pieza (RD$)</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={serviceDetails[service]?.pieceCost || ""}
                              onChange={(event) =>
                                setServiceDetails((previous) => ({
                                  ...previous,
                                  [service]: { pieceCost: event.target.value, charge: previous[service]?.charge || "" },
                                }))
                              }
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-gray-600 dark:text-gray-400">Monto a cobrar (RD$)</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={serviceDetails[service]?.charge || ""}
                              onChange={(event) =>
                                setServiceDetails((previous) => ({
                                  ...previous,
                                  [service]: { pieceCost: previous[service]?.pieceCost || "", charge: event.target.value },
                                }))
                              }
                              className="text-sm font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                      <span>Total a cobrar</span>
                      <span>RD$ {totalServiceCharge.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-900 dark:text-white">
                        Monto a Pagar (RD$) *
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">$</span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={cost}
                          readOnly
                          className="pl-7 font-bold text-sm bg-gray-100 dark:bg-gray-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Abono / Adelanto (RD$)
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-emerald-600 font-bold">$</span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={deposit}
                          onChange={(e) => setDeposit(e.target.value)}
                          className="pl-7 font-bold text-sm text-emerald-700 dark:text-emerald-400 bg-white dark:bg-gray-900"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-rose-700 dark:text-rose-400">
                        Saldo Pendiente (Calculado)
                      </Label>
                      <div className="flex h-10 items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-3 font-extrabold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400 text-sm">
                        <span>RD$</span>
                        <span>{pendingBalance.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer and Navigation Action Buttons (Fixed) */}
        <DialogFooter className="min-w-0 p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/90 shrink-0 flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
          {/* Previous / Step Navigation */}
          <div className="flex items-center gap-1.5 w-full min-w-0 sm:w-auto justify-between sm:justify-start">
            {activeTab === "general" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                Cancelar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("general")}
                className="text-xs font-medium"
              >
                ← Anterior (Cliente y Equipo)
              </Button>
            )}

            {/* Quick Actions (WhatsApp & Invoice) */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNotifyWhatsapp}
                className="text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950 px-2 sm:px-3"
                title="Notificar por WhatsApp"
              >
                <MessageSquare className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>

              {editingRepair && !isFinalizedRepair && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConvertToInvoice}
                  className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950 px-2 sm:px-3"
                  title="Convertir a Factura"
                >
                  <FileText className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Facturar</span>
                </Button>
              )}
            </div>
          </div>

          {/* Next / Save Buttons */}
          <div className="flex items-center gap-2 w-full min-w-0 sm:w-auto justify-end">
            {activeTab === "general" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setActiveTab("inspection")}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold w-full sm:w-auto whitespace-normal"
              >
                Siguiente: Inspección y Presupuesto →
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => handleSave(false)}
                  className="text-xs font-semibold"
                >
                  Guardar Solo
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => handleSave(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  Guardar e Imprimir Ticket
                </Button>
              </>
            )}
          </div>
        </DialogFooter>

        {/* Thermal Print Hidden View */}
        {printMode && createdRepairData && (
          <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-2">
            {printMode === "ticket" ? (
              <RepairTicketPrint repair={createdRepairData} />
            ) : (
              <RepairStickerPrint repair={createdRepairData} />
            )}
          </div>
        )}

        {/* Modal de Notificación de Falla Inesperada */}
        <UnexpectedFaultDialog
          open={isUnexpectedFaultOpen}
          onOpenChange={setIsUnexpectedFaultOpen}
          repair={editingRepair}
          defaultClientName={clientName}
          defaultPhone={whatsapp || customerPhone}
          defaultDevice={`${brand} ${model}`.trim()}
          defaultInitialService={finalServiceType}
          defaultInitialCost={estimatedCostNum}
          defaultDeposit={depositNum}
          onApplyExtra={handleApplyUnexpectedFault}
        />
        {/* Modal de Cámara Live */}
        <Dialog open={Boolean(previewPhoto)} onOpenChange={(open) => { if (!open) setPreviewPhoto(null) }}>
          <DialogContent className="w-[95vw] max-w-4xl p-3 bg-black border-gray-800">
            <DialogHeader className="sr-only">
              <DialogTitle>Vista ampliada de la fotografía</DialogTitle>
              <DialogDescription>Fotografía del estado físico del equipo.</DialogDescription>
            </DialogHeader>
            {previewPhoto && (
              <img src={previewPhoto} alt="Fotografía ampliada del equipo" className="max-h-[80vh] w-full object-contain rounded-lg" />
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={isWebcamOpen} onOpenChange={(open) => { if (!open) stopWebcam() }}>
          <DialogContent className="max-w-lg p-5 bg-gray-900 text-white border-gray-800 rounded-2xl z-[9999]">
            <DialogHeader className="pb-3 border-b border-gray-800">
              <DialogTitle className="flex items-center gap-2 text-white text-base">
                <Camera className="h-5 w-5 text-blue-400" />
                Cámara Live del Equipo
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-400">
                Apunta la cámara al dispositivo y presiona "Tomar Foto".
              </DialogDescription>
            </DialogHeader>

            <div className="relative my-3 aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startWebcam(webcamFacing === "environment" ? "user" : "environment")}
                className="text-xs text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <RotateCw className="h-4 w-4 mr-1.5" />
                Cambiar Cámara
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={captureWebcamPhoto}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 h-9 rounded-xl gap-1.5 shadow-md"
                >
                  <Camera className="h-4 w-4" />
                  Tomar Foto ({photos.length})
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={stopWebcam}
                  className="bg-gray-800 hover:bg-gray-700 text-white text-xs h-9 px-3 rounded-xl"
                >
                  Finalizar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
