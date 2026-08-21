"use client"

import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, MessageSquare, Check, DollarSign, Plus, Trash2, ShieldAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { sendWhatsappBotMessage } from "@/lib/whatsapp-bot"
import { getPhoneForRepair } from "@/lib/repair-utils"
import { useStore, type Repair } from "@/components/store-context"
import { NOMBRECONFI } from "@/nombreconfi"
import { getTenantBranding } from "@/lib/tenant-branding"

interface UnexpectedFaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repair?: Repair | null
  // Optional default values when called from repair-dialog creation form
  defaultClientName?: string
  defaultPhone?: string
  defaultDevice?: string
  defaultInitialService?: string
  defaultInitialCost?: number
  defaultDeposit?: number
  onApplyExtra?: (updatedService: string, newTotalCost: number, unexpectedNote: string) => void
}

const FAULT_PRESETS = [
  { fault: "Batería defectuosa / hinchada", service: "Cambio de Batería" },
  { fault: "Pin / Conector de carga dañado o sulfurado", service: "Cambio de Pin de Carga" },
  { fault: "Sulfatación / Humedad en tarjeta madre", service: "Mantenimiento por Humedad" },
  { fault: "Lente / Cámara trasera opaca o dañada", service: "Cambio de Cámara / Lente" },
  { fault: "Auricular o altavoz sin sonido", service: "Cambio de Altavoz" },
  { fault: "Botón de encendido / volumen roto", service: "Reparación Flex de Botones" },
  { fault: "Tapa trasera rota / marco deformado", service: "Cambio de Tapa / Chasis" },
]

export function UnexpectedFaultDialog({
  open,
  onOpenChange,
  repair,
  defaultClientName = "",
  defaultPhone = "",
  defaultDevice = "",
  defaultInitialService = "Servicio Inicial",
  defaultInitialCost = 0,
  defaultDeposit = 0,
  onApplyExtra,
}: UnexpectedFaultDialogProps) {
  const { customers, updateRepair, currentUser } = useStore()
  const { toast } = useToast()

  // Form states
  const [clientName, setClientName] = useState("")
  const [phone, setPhone] = useState("")
  const [device, setDevice] = useState("")

  const [initialService, setInitialService] = useState("")
  const [initialCost, setInitialCost] = useState<number>(0)
  const [deposit, setDeposit] = useState<number>(0)

  // Extra service states
  const [unexpectedFault, setUnexpectedFault] = useState("")
  const [unexpectedFaults, setUnexpectedFaults] = useState<string[]>([])
  const [faultDraft, setFaultDraft] = useState("")
  const [extraService, setExtraService] = useState("")
  const [extraServiceDraft, setExtraServiceDraft] = useState("")
  const [extraPieceCost, setExtraPieceCost] = useState("0")
  const [extraCost, setExtraCost] = useState<string>("")
  const [extraServiceDetails, setExtraServiceDetails] = useState<Record<string, { pieceCost: string; charge: string }>>({})

  useEffect(() => {
    if (repair) {
      setClientName(repair.client || "Cliente")
      const resolvedPhone = getPhoneForRepair(repair, customers)
      setPhone(resolvedPhone || "")
      setDevice(repair.device || `${repair.brand || ""} ${repair.model || ""}`.trim() || "Equipo")
      setInitialService(repair.type || "Reparación Principal")
      setInitialCost(Number(repair.cost) || 0)
      setDeposit(Number(repair.deposit) || 0)
    } else {
      setClientName(defaultClientName || "Cliente")
      setPhone(defaultPhone || "")
      setDevice(defaultDevice || "Equipo")
      setInitialService(defaultInitialService || "Servicio Principal")
      setInitialCost(defaultInitialCost || 0)
      setDeposit(defaultDeposit || 0)
    }
    setUnexpectedFaults([])
    setFaultDraft("")
    setExtraService("")
    setExtraServiceDraft("")
    setExtraPieceCost("0")
    setExtraCost("0")
    setExtraServiceDetails({})
  }, [repair, open, defaultClientName, defaultPhone, defaultDevice, defaultInitialService, defaultInitialCost, defaultDeposit])

  const extraCostNum = Number(extraCost) || 0
  const extraServiceNames = Array.from(new Set(extraService.split(",").map((service) => service.trim()).filter(Boolean)))
  const initialServiceNames = Array.from(new Set(initialService.split(",").map((service) => service.trim()).filter(Boolean)))
  const calculatedExtraCost = extraServiceNames.reduce(
    (total, service) => total + (Number(extraServiceDetails[service]?.charge) || 0),
    0,
  )

  useEffect(() => {
    if (extraServiceNames.length > 0) setExtraCost(calculatedExtraCost.toString())
  }, [extraService, extraServiceDetails])

  const grandTotal = initialCost + extraCostNum
  const pendingBalance = Math.max(0, grandTotal - deposit)

  const handleSelectPreset = (preset: { fault: string; service: string }) => {
    setUnexpectedFaults((previous) => [...previous, preset.fault])
    setExtraService((previous) => {
      const services = previous.split(",").map((item) => item.trim()).filter(Boolean)
      if (!services.includes(preset.service)) services.push(preset.service)
      return services.join(", ")
    })
    setExtraServiceDetails((previous) => ({
      ...previous,
      [preset.service]: previous[preset.service] || { pieceCost: "0", charge: "0" },
    }))
  }

  const removeUnexpectedFault = (index: number) => {
    const fault = unexpectedFaults[index]
    const preset = FAULT_PRESETS.find((item) => item.fault === fault)
    const remainingFaults = unexpectedFaults.filter((_, itemIndex) => itemIndex !== index)
    setUnexpectedFaults(remainingFaults)

    if (preset) {
      const serviceStillUsed = remainingFaults.some((remainingFault) =>
        FAULT_PRESETS.some((item) => item.fault === remainingFault && item.service === preset.service),
      )
      if (!serviceStillUsed) {
        const remainingServices = extraService
          .split(",")
          .map((service) => service.trim())
          .filter((service) => service && service !== preset.service)
        setExtraService(remainingServices.join(", "))
        setExtraServiceDetails((previous) => {
          const next = { ...previous }
          delete next[preset.service]
          return next
        })
      }
    }
  }

  const addManualFault = () => {
    const fault = faultDraft.trim()
    if (!fault) return
    setUnexpectedFaults((previous) => [...previous, fault])
    setFaultDraft("")
  }

  const unexpectedFaultText = unexpectedFaults.map((fault) => fault.trim()).filter(Boolean).join("\n")

  const addManualExtraService = () => {
    const product = extraServiceDraft.trim()
    if (!product) return
    const products = extraService.split(",").map((item) => item.trim()).filter(Boolean)
    if (!products.includes(product)) products.push(product)
    setExtraService(products.join(", "))
    setExtraServiceDetails((previous) => ({
      ...previous,
      [product]: previous[product] || { pieceCost: "0", charge: "0" },
    }))
    setExtraServiceDraft("")
  }

  const buildWhatsappMessage = async () => {
    const ticketNo = repair?.repair_number ? `Orden N°: ${repair.repair_number}\n` : ""
    const branding = await getTenantBranding(currentUser?.ownerAdminId)
    const storeName = branding.businessName || NOMBRECONFI.businessName || "ARKHAM"
    return (
      `🚨 *${storeName} - NOTIFICACIÓN DE DIAGNÓSTICO ADICIONAL*\n\n` +
      `Estimado/a *${clientName || "Cliente"}*,\n` +
      `Durante el proceso de reparación de su equipo *${device}*, nuestro equipo técnico ha detectado una falla imprevista:\n\n` +
      `⚠️ *Falla Inesperada:* ${unexpectedFaultText || "Falla adicional detectada"}\n` +
      `🛠️ *Servicio Adicional Recomendado:* ${extraService || "Servicio Adicional"}\n\n` +
      `📋 *DESGLOSE DE PRESUPUESTO Y SERVICIOS:*\n` +
      `• ${initialService}: RD$ ${initialCost.toLocaleString("es-DO", { minimumFractionDigits: 2 })}\n` +
      `• ${extraService} (NUEVO ADICIONAL): RD$ ${extraCostNum.toLocaleString("es-DO", { minimumFractionDigits: 2 })}\n` +
      `----------------------------------------\n` +
      `💰 *TOTAL MONTO A PAGAR:* RD$ ${grandTotal.toLocaleString("es-DO", { minimumFractionDigits: 2 })}\n` +
      (deposit > 0 ? `💵 *Abono Previo:* RD$ ${deposit.toLocaleString("es-DO", { minimumFractionDigits: 2 })}\n` : "") +
      `🔴 *Saldo Pendiente:* RD$ ${pendingBalance.toLocaleString("es-DO", { minimumFractionDigits: 2 })}\n\n` +
      `¿Acepta la realización de este servicio adicional para proceder? Por favor respóndanos con:\n` +
      `1️⃣ *"SÍ, AUTORIZO"* para incluir el cambio.\n` +
      `2️⃣ *"NO"* para mantener solo el trabajo inicial.\n\n` +
      `Gracias por preferirnos.`
    )
  }

  const handleSendWhatsapp = async () => {
    const rawDigits = phone.replace(/\D/g, "")
    if (!rawDigits) {
      toast({
        title: "Sin número de WhatsApp",
        description: "Por favor ingresa un número de teléfono válido para el cliente.",
        variant: "destructive",
      })
      return
    }

    const message = await buildWhatsappMessage()
    const ticketNo = repair?.repair_number || "ADICIONAL"

    const res = await sendWhatsappBotMessage({
      id: repair?.id,
      phone: rawDigits,
      message,
      name: clientName,
      repairNumber: String(ticketNo),
    })

    if (res.usedBot) {
      toast({
        title: "Notificación enviada por WhatsApp Bot",
        description: `Se envió la consulta de autorización de falla inesperada a ${clientName}.`,
      })
    } else {
      toast({
        title: "Abriendo WhatsApp",
        description: "Se abrió WhatsApp con la consulta formateada para el cliente.",
      })
    }
  }

  const handleApplyToRepair = async () => {
    const updatedCombinedService = `${initialService} + ${extraService} (Adicional)`
    const extraNote = `[Falla Inesperada Reportada]: ${unexpectedFaultText} (Adicional RD$ ${extraCostNum})`

    if (repair?.id) {
      try {
        const newIssue = repair.issue ? `${repair.issue}\n${extraNote}` : extraNote
        await updateRepair(repair.id, {
          type: updatedCombinedService,
          cost: grandTotal.toString(),
          pendingBalance: Math.max(0, grandTotal - (Number(repair.deposit) || 0)),
          issue: newIssue,
        })
        toast({
          title: "Monto y Orden Actualizados",
          description: `Se agregó ${extraService} por RD$ ${extraCostNum}. Nuevo total: RD$ ${grandTotal.toLocaleString()}`,
        })
      } catch (err: any) {
        toast({
          title: "Error al actualizar",
          description: err.message || "No se pudo actualizar la orden.",
          variant: "destructive",
        })
      }
    }

    if (onApplyExtra) {
      onApplyExtra(updatedCombinedService, grandTotal, extraNote)
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[80vw] sm:max-w-[80vw] h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] sm:h-auto sm:max-h-[90vh] overflow-hidden p-0 rounded-2xl border-amber-200 dark:border-amber-900/50 flex flex-col">
        <DialogHeader className="min-w-0 shrink-0 p-3 sm:p-5 border-b border-amber-100 bg-amber-50/70 dark:bg-amber-950/40 dark:border-amber-900/60">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 pr-5">
              <DialogTitle className="break-words text-base sm:text-lg font-bold text-amber-950 dark:text-amber-200">
                Informar Falla Inesperada al Cliente
              </DialogTitle>
              <DialogDescription className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Consulte al cliente sobre fallas no previstas durante la reparación y envíe el desglose detallado de costos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 space-y-5">
          {/* Cliente y Equipo Header */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-gray-500">Cliente:</span>{" "}
              <strong className="text-gray-900 dark:text-white">{clientName}</strong>
            </div>
            <div>
              <span className="text-gray-500">Teléfono/WhatsApp:</span>{" "}
              <strong className="text-gray-900 dark:text-white">{phone || "No especificado"}</strong>
            </div>
            <div>
              <span className="text-gray-500">Equipo:</span>{" "}
              <strong className="text-gray-900 dark:text-white">{device}</strong>
            </div>
          </div>

          {/* Falla inesperada a registrar */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 space-y-2">
            <Label className="text-xs font-bold text-gray-900 dark:text-white">
              Falla Inesperada al Cliente
            </Label>
            <div className="space-y-2">
              {unexpectedFaults.map((fault, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Ej. Batería hinchada / defectuosa al retirar la pantalla"
                    value={fault}
                    onChange={(event) =>
                      setUnexpectedFaults((previous) => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))
                    }
                    className="text-sm bg-white dark:bg-gray-900"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeUnexpectedFault(index)}
                    title="Eliminar falla"
                    className="h-9 w-9 shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <span className="text-lg leading-none">×</span>
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={faultDraft}
                  onChange={(event) => setFaultDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addManualFault()
                    }
                  }}
                  placeholder="Escriba otra falla manual"
                  className="text-sm bg-white dark:bg-gray-900"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={addManualFault}
                  title="Agregar falla manual"
                  className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Input
              placeholder="Ej. Batería hinchada / defectuosa al retirar la pantalla"
              value={unexpectedFault}
              onChange={(e) => setUnexpectedFault(e.target.value)}
              className="hidden"
            />
          </div>

          {/* Preset Buttons for common unexpected issues */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
              1. SELECCIONAR FALLA INESPERADA FRECUENTE:
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {FAULT_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  + {p.fault}
                </button>
              ))}
            </div>
          </div>

          {/* Detalle por servicio */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/60 space-y-3">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Detalle por servicio</p>
            {extraServiceNames.map((service) => (
              <div key={service} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <p className="mb-3 text-sm font-bold text-gray-900 dark:text-white">{service}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-gray-600 dark:text-gray-400">Costo de la pieza (RD$)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={extraServiceDetails[service]?.pieceCost || ""}
                      onChange={(event) => setExtraServiceDetails((previous) => ({
                        ...previous,
                        [service]: { pieceCost: event.target.value, charge: previous[service]?.charge || "" },
                      }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-gray-600 dark:text-gray-400">Monto a cobrar (RD$)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={extraServiceDetails[service]?.charge || ""}
                      onChange={(event) => setExtraServiceDetails((previous) => ({
                        ...previous,
                        [service]: { pieceCost: previous[service]?.pieceCost || "", charge: event.target.value },
                      }))}
                      placeholder="0.00"
                      className="font-bold"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={extraServiceDraft}
                onChange={(event) => setExtraServiceDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addManualExtraService()
                  }
                }}
                placeholder="Escriba otro servicio o producto"
                className="bg-white text-sm dark:bg-gray-900"
              />
              <Button type="button" size="icon" onClick={addManualExtraService} title="Agregar servicio o producto" className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Form fields for the new fault and extra cost */}
          <div className="hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="hidden">
              <Label className="text-xs font-bold text-gray-900 dark:text-white">
                Falla Inesperada Detectada
              </Label>
              <Input
                placeholder="Ej. Batería hinchada / defectuosa al retirar la pantalla"
                value={unexpectedFault}
                onChange={(e) => setUnexpectedFault(e.target.value)}
                className="text-xs bg-white dark:bg-gray-900"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-900 dark:text-white">
                Servicio Adicional a Realizar
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Escriba un producto o servicio"
                  value={extraServiceDraft}
                  onChange={(e) => setExtraServiceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addManualExtraService()
                    }
                  }}
                  className="text-xs bg-white dark:bg-gray-900"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={addManualExtraService}
                  title="Agregar producto o servicio"
                  className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">Agregados: {extraService || "Ninguno"}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                Monto Adicional por este Cambio (RD$)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-emerald-600">$</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={extraCost}
                  onChange={(e) => setExtraCost(e.target.value)}
                  className="pl-7 font-bold text-sm text-emerald-700 dark:text-emerald-400 bg-white dark:bg-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Desglose de Presupuesto Resultante */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-900/60 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Desglose Actualizado de Servicios y Montos
              </h4>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                Vista previa del cliente
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {initialServiceNames.map((service, index) => {
                const savedService = repair?.serviceItems?.find((item) => item.name === service)
                const serviceCost = savedService
                  ? Number(savedService.charge) || 0
                  : initialServiceNames.length === 1 || index === 0
                    ? initialCost
                    : 0
                return (
                  <div key={service} className="flex items-center justify-between py-1 border-b border-dashed border-emerald-200 dark:border-emerald-900/40">
                    <span className="text-gray-700 dark:text-gray-300">{index + 1}. {service}</span>
                    <strong className="text-gray-900 dark:text-white">
                      RD$ {serviceCost.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                )
              })}

              {extraServiceNames.map((service, index) => (
                <div key={service} className="flex items-center justify-between py-1 border-b border-dashed border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-semibold">
                  <span>{initialServiceNames.length + index + 1}. {service}</span>
                  <strong>+ RD$ {(Number(extraServiceDetails[service]?.charge) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 })}</strong>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2 text-sm font-extrabold text-gray-900 dark:text-white">
                <span>TOTAL MONTO A PAGAR:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  RD$ {grandTotal.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {deposit > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Abono realizado previamente:</span>
                  <span>- RD$ {deposit.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                <span>Saldo Pendiente Estimado:</span>
                <span>RD$ {pendingBalance.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Pre-formatted Message Box */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center justify-between">
              <span>Mensaje a enviar al cliente por WhatsApp:</span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Auto-generado</span>
            </Label>
            <Textarea
              readOnly
              rows={8}
              value={buildWhatsappMessage()}
              className="text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 leading-relaxed rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 p-3 sm:p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Cerrar
          </Button>

          <div className="flex w-full min-w-0 flex-col sm:w-auto sm:flex-row items-stretch sm:items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSendWhatsapp}
              className="w-full sm:w-auto whitespace-normal bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-1.5"
            >
              <MessageSquare className="h-4 w-4" />
              Enviar Pregunta por WhatsApp
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleApplyToRepair}
              className="w-full sm:w-auto whitespace-normal bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl gap-1.5"
            >
              <Check className="h-4 w-4" />
              Aplicar y Actualizar Monto
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
