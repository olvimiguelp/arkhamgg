"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Search,
  Pencil,
  Trash2,
  MoreHorizontal,
  Phone,
  Mail,
  CreditCard,
  History,
  Users,
  Wallet,
  Printer,
  Loader2,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import QRCode from "qrcode"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useStore } from "@/components/store-context"
import type { Customer, Sale, Payment } from "@/components/store-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatCurrency } from "@/lib/utils"
import { generateSalesReportPDF } from "@/lib/report-pdf-generator"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useSystemConfig } from "@/hooks/use-system-config"
import { useTenantSubscription } from "@/hooks/use-tenant-subscription"
import { getMembershipSelection } from "@/lib/membership"
import { getLocalWebhookUrl, getLocalHealthUrl, getWebhookSecret } from "@/lib/webhook-dns-utils"
import { printPaymentInvoice } from "@/components/invoice-printer"
import { Pagado } from "@/components/pagado"
import { FacturaPagada } from "@/components/factura-pagada"
import {
  allocatePaymentToInvoices,
  formatSaleCreatedDateTime,
  getFirstCreatedPendingSale,
  getSaleCreditPendingAmount,
  shouldShowInCustomerPurchaseHistory,
  sortSalesByRecencyDesc,
} from "@/lib/credit-sale-utils"
import type { SaveClientInvoiceOptions } from "@/lib/invoice-storage"

type ReportPeriod = "general" | "year" | "month" | "day"

const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  general: "Todo el historial",
  year: "Año",
  month: "Mes",
  day: "Día",
}
const normalizeIdList = (values: string[]) => Array.from(new Set(values)).sort()

const AUTO_SEND_HOUR = 10
const AUTO_SEND_MINUTE = 30
const AUTO_SEND_ENABLED = (import.meta as any).env?.VITE_ENABLE_AUTO_REMINDER_SCHEDULE !== "false"
const DEFAULT_REMINDER_INTERVAL_DAYS = 15
const MAX_REMINDER_INTERVAL_DAYS = 30
const FALLBACK_REMINDER_MESSAGE_TEMPLATE =
  "Hola {{name}}, buenos días.\n\nLe escribimos de ARKHAM para informarle que tiene una deuda pendiente de {{debt}} con nosotros. Le solicitamos que pase por una de nuestras sucursales para saldarla o realizar un abono.\n\nGracias por su atención."

const normalizeReminderTemplate = (value?: string | null) => {
  if (typeof value !== "string") return ""
  return value.replace(/\\n/g, "\n").trim()
}

const REMINDER_FREQUENCY_OPTIONS = Array.from({ length: MAX_REMINDER_INTERVAL_DAYS }, (_, index) => {
  const value = index + 1
  return {
    value,
    label: value === 1 ? "Cada 1 día" : `Cada ${value} días`,
  }
})

const normalizeReminderIntervalDays = (value?: number | string | null) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_INTERVAL_DAYS
  return Math.min(MAX_REMINDER_INTERVAL_DAYS, Math.max(1, Math.round(parsed)))
}

const getReminderFrequencyLabel = (value?: number) =>
  REMINDER_FREQUENCY_OPTIONS.find((option) => option.value === normalizeReminderIntervalDays(value))?.label ??
  `Cada ${DEFAULT_REMINDER_INTERVAL_DAYS} días`

const formatReminderLastSent = (value?: string | null) => {
  if (!value) return "Nunca"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Nunca" : date.toLocaleDateString()
}

const formatReminderDebt = (value?: number | string | null) => {
  const num = Number(value ?? 0)
  if (Number.isNaN(num)) return "0"
  return num.toFixed(2)
}

const applyReminderTemplate = (template: string, customer: Customer) => {
  return template
    .replaceAll("{{name}}", customer.name || "Cliente")
    .replaceAll("{{debt}}", formatReminderDebt(customer.debt))
    .replaceAll("{{phone}}", customer.phone || "")
}

const isAfterAutomaticReminderTime = (date = new Date()) =>
  date.getHours() > AUTO_SEND_HOUR || (date.getHours() === AUTO_SEND_HOUR && date.getMinutes() >= AUTO_SEND_MINUTE)

const getReminderDaysSinceLastSent = (value?: string | null, now = new Date()) => {
  if (!value) return Number.POSITIVE_INFINITY
  const lastSentAt = new Date(value)
  if (Number.isNaN(lastSentAt.getTime())) return Number.POSITIVE_INFINITY

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const lastSentDay = new Date(lastSentAt.getFullYear(), lastSentAt.getMonth(), lastSentAt.getDate())
  return Math.floor((today.getTime() - lastSentDay.getTime()) / (24 * 60 * 60 * 1000))
}

const isCustomerDueForAutomaticReminder = (customer: Customer, now = new Date()) => {
  if (!(customer.reminderEnabled ?? false)) return false
  if ((customer.phone || "").trim().length === 0) return false
  if ((customer.debt || 0) <= 0) return false
  if (!isAfterAutomaticReminderTime(now)) return false

  return (
    getReminderDaysSinceLastSent(customer.reminderLastSentAt, now) >=
    normalizeReminderIntervalDays(customer.reminderIntervalDays)
  )
}

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

const normalizePlanValue = (value?: string | null) =>
  String(value ?? "").trim().toLowerCase()

const getPlanListFromConfig = (input: any) => {
  if (Array.isArray(input)) return input
  if (Array.isArray(input?.plans)) return input.plans
  return []
}

const readAccessFlag = (value: any): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "on",
        "enabled",
        "enable",
        "active",
        "activo",
        "activa",
      ].includes(normalized)
    ) {
      return true
    }
    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
        "inactivo",
        "inactiva",
      ].includes(normalized)
    ) {
      return false
    }
  }
  if (value && typeof value === "object") {
    if ("enabled" in value) return readAccessFlag((value as any).enabled)
    if ("allowed" in value) return readAccessFlag((value as any).allowed)
    if ("active" in value) return readAccessFlag((value as any).active)
    if ("value" in value) return readAccessFlag((value as any).value)
  }
  return false
}

type ReportRow = {
  invoice: string
  date: Date
  product: string
  quantity: number
  price: number
  total: number
  status: Sale["status"]
}

function getTodayMonthValue() {
  const today = new Date()
  const month = `${today.getMonth() + 1}`.padStart(2, "0")
  return `${today.getFullYear()}-${month}`
}

function getTodayDateValue() {
  const today = new Date()
  const month = `${today.getMonth() + 1}`.padStart(2, "0")
  const day = `${today.getDate()}`.padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}

export default function CustomersPage() {
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    setOnDialogOpen,
    sales,
    payments,
    paymentAllocations,
    addPayment,
    deletePayment,
    products,
    deleteSale,
    updateSale,
    employees,
    currentUser,
  } = useStore()
  const employee = employees.find((e) => e.email === currentUser?.email)
  const isAdmin = currentUser?.role === "admin"
  const canAdd = isAdmin || employee?.permissions.canAdd
  const canDelete = isAdmin || employee?.permissions.canDelete
  const canEdit = isAdmin || employee?.permissions.canEdit
  const tenantAdminId = currentUser?.adminId ?? null
  const { row: tenantSubscription, loading: tenantSubscriptionLoading } =
    useTenantSubscription(tenantAdminId)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null)

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [customerHistory, setCustomerHistory] = useState<Sale[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])

  const isGeneralCustomerSale = (sale: Sale, customer: Customer) =>
    (sale.customerName === customer.name ||
      (sale.customerPhone && sale.customerPhone === customer.phone) ||
      (sale.customerId && sale.customerId === customer.id) ||
      (sale.almacenSourceCustomerId && sale.almacenSourceCustomerId === customer.id)) &&
    !sale.almacenCustomerAccountId

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [recentPaymentReceipt, setRecentPaymentReceipt] = useState<{ payment: Payment; customer: Customer } | null>(null)
  const [selectedCreditDevice, setSelectedCreditDevice] = useState<string>("")
  const [openCombobox, setOpenCombobox] = useState(false)
  const [openEditCombobox, setOpenEditCombobox] = useState(false)
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null)

  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderIntervalDays, setReminderIntervalDays] = useState<number>(DEFAULT_REMINDER_INTERVAL_DAYS)
  const [reminderMessage, setReminderMessage] = useState("")
  const [defaultReminderMessageTemplate, setDefaultReminderMessageTemplate] = useState(
    () =>
      normalizeReminderTemplate((import.meta as any).env?.VITE_REMINDER_MESSAGE_TEMPLATE) ||
      FALLBACK_REMINDER_MESSAGE_TEMPLATE,
  )
  const [manualSendMessageTemplate, setManualSendMessageTemplate] = useState("")
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false)
  const [reminderQuickEditCustomerId, setReminderQuickEditCustomerId] = useState<string | null>(null)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [isSendingReminders, setIsSendingReminders] = useState(false)
  const [sendingSingleCustomerId, setSendingSingleCustomerId] = useState<string | null>(null)
  const [isSendOptionsDialogOpen, setIsSendOptionsDialogOpen] = useState(false)
  const [isConfirmRemindersOpen, setIsConfirmRemindersOpen] = useState(false)
  const [sendScope, setSendScope] = useState<"selected" | "all">("selected")
  const [isWhatsappDialogOpen, setIsWhatsappDialogOpen] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState<{ ready: boolean; qr: string | null }>({
    ready: false,
    qr: null,
  })
  const [whatsappQrDataUrl, setWhatsappQrDataUrl] = useState<string>("")
  const [isWhatsappConnecting, setIsWhatsappConnecting] = useState(false)
  const [lastAutoSendDate, setLastAutoSendDate] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem("lastAutoSendDate") || ""
  })
  const ipcRenderer =
    typeof window !== "undefined" ? (window as any).require?.("electron")?.ipcRenderer : null

  const [isConfirmPaymentDialogOpen, setIsConfirmPaymentDialogOpen] = useState(false)
  const [selectedPaymentSaleIds, setSelectedPaymentSaleIds] = useState<string[]>([])
  const [paymentAmountDraft, setPaymentAmountDraft] = useState<string>("")
  const [pendingPayment, setPendingPayment] = useState<{
    amount: number
    note: string
    paymentMethod: "cash" | "card" | "transfer"
    appliedSaleIds: string[]
  } | null>(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentMethodAbono, setPaymentMethodAbono] = useState<"cash" | "card" | "transfer">("cash")
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null)
  const [isDeletingPayment, setIsDeletingPayment] = useState(false)

  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

  // History filtering and reporting
  const [showOnlyCredit, setShowOnlyCredit] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("general")
  const [reportYear, setReportYear] = useState<string>(() => String(new Date().getFullYear()))
  const [reportMonth, setReportMonth] = useState<string>(() => getTodayMonthValue())
  const [reportDay, setReportDay] = useState<string>(() => getTodayDateValue())
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)


  const { config: systemConfig, loading: systemConfigLoading } = useSystemConfig({
    keys: [
      "membership_payment_proof",
      "membership_plans",
      "membership_block",
      "whatsapp_bot_access",
      "whatsapp_bot_feature",
      "whatsapp_reminders_access",
      "feature_whatsapp_bot",
      "feature_whatsapp_reminders",
    ],
  })

  const membershipSelection = useMemo(
    () => getMembershipSelection(systemConfig),
    [systemConfig],
  )
  const blockConfig = systemConfig?.membership_block ?? {}
  const planConfig = systemConfig?.membership_plans
  const planList = useMemo(() => getPlanListFromConfig(planConfig), [planConfig])
  const selectionKey = useMemo(
    () => normalizePlanValue(membershipSelection.planId ?? membershipSelection.planName),
    [membershipSelection.planId, membershipSelection.planName],
  )
  const selectedPlan = useMemo(() => {
    if (!selectionKey) return null
    return (
      planList.find((plan: any) =>
        [plan?.id, plan?.name]
          .filter(Boolean)
          .some((value: any) => normalizePlanValue(value) === selectionKey),
      ) ?? null
    )
  }, [planList, selectionKey])

  const isPremiumPlan = useMemo(() => {
    if (selectedPlan?.highlight) return true
    return selectionKey.includes("premium")
  }, [selectedPlan, selectionKey])

  const normalizedMembershipStatus = String(membershipSelection.status ?? "").toLowerCase()
  const isMembershipApproved =
    Boolean(membershipSelection.approvedAt) ||
    [
      "approved",
      "aprobado",
      "aprobada",
      "activo",
      "activa",
      "active",
    ].includes(normalizedMembershipStatus)
  const membershipExpiresAt = useMemo(() => {
    if (!membershipSelection.expiresAt) return null
    const date = new Date(membershipSelection.expiresAt)
    return Number.isNaN(date.getTime()) ? null : date
  }, [membershipSelection.expiresAt])

  const isMembershipActive =
    isMembershipApproved &&
    (!membershipExpiresAt || membershipExpiresAt.getTime() > Date.now())
  const isMembershipBlocked = Boolean((blockConfig as any)?.enabled)

  const botAccessConfig =
    systemConfig?.whatsapp_bot_access ??
    systemConfig?.whatsapp_bot_feature ??
    systemConfig?.whatsapp_reminders_access ??
    systemConfig?.feature_whatsapp_bot ??
    systemConfig?.feature_whatsapp_reminders

  const hasBotAccessConfig = botAccessConfig !== undefined && botAccessConfig !== null
  const manualAccessEnabled = readAccessFlag(botAccessConfig)
  const tenantWhatsappBotAccess = Boolean(tenantSubscription?.whatsapp_bot_access)
  const hasPremiumAccess = isMembershipActive && isPremiumPlan
  const canUseWhatsappBot = tenantWhatsappBotAccess
    ? true
    : hasBotAccessConfig
      ? manualAccessEnabled
      : hasPremiumAccess
  const isBotAccessExplicitlyDisabled =
    !tenantWhatsappBotAccess && hasBotAccessConfig && !manualAccessEnabled
  const whatsappAccessLoading = systemConfigLoading || tenantSubscriptionLoading
  const whatsappBotDisabled =
    whatsappAccessLoading || isMembershipBlocked || !canUseWhatsappBot
  const whatsappAccessMessage = whatsappAccessLoading
    ? "Validando acceso al bot de WhatsApp..."
    : isMembershipBlocked
    ? "Acceso bloqueado por membresía."
    : "Función exclusiva del Plan Premium."
  const whatsappTooltipMessage = whatsappBotDisabled
    ? whatsappAccessMessage
    : "Conectar WhatsApp"
  const whatsappAccessTone = whatsappAccessLoading
    ? "text-muted-foreground"
    : isMembershipBlocked || isBotAccessExplicitlyDisabled
    ? "text-red-600"
    : "text-amber-600"

  const handleOpenAddDialog = useCallback(() => {
    if (!canAdd) {
      toast.error("No tienes permisos para agregar clientes.")
      return
    }
    setIsAddDialogOpen(true)
    setReminderEnabled(false)
    setReminderIntervalDays(DEFAULT_REMINDER_INTERVAL_DAYS)
    setReminderMessage("")
  }, [canAdd, toast])

  useEffect(() => {
    if (setOnDialogOpen) {
      setOnDialogOpen(handleOpenAddDialog)
    }
    return () => {
      if (setOnDialogOpen) {
        setOnDialogOpen(() => { })
      }
    }
  }, [setOnDialogOpen, handleOpenAddDialog])

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.invoke("whatsapp:status").then((status: any) => {
        if (status) setWhatsappStatus(status)
      })
      const handleStatus = (_event: any, status: any) => {
        setWhatsappStatus(status)
      }
      const handleError = (_event: any, errorMessage: string) => {
        toast.error(`Error de WhatsApp: ${errorMessage}`)
      }
      ipcRenderer.on("whatsapp:status", handleStatus)
      ipcRenderer.on("whatsapp:error", handleError)
      return () => {
        ipcRenderer.removeListener("whatsapp:status", handleStatus)
        ipcRenderer.removeListener("whatsapp:error", handleError)
      }
    } else {
      let active = true
      const envLocalWebhook = (import.meta as any).env?.VITE_REMINDER_LOCAL_WEBHOOK_URL
      if (!envLocalWebhook) {
        console.debug("[whatsapp] local webhook not configured; skipping health poll (clientes)")
        setWhatsappStatus({ ready: false, qr: null })
        return
      }

      const poll = async () => {
        try {
          const localWebhookUrl = getLocalWebhookUrl()
          const localHealthUrl = getLocalHealthUrl(localWebhookUrl)
          const res = await fetch(localHealthUrl, { method: "GET" })
          if (res.ok) {
            const data = await res.json()
            if (active) {
              setWhatsappStatus({
                ready: data.ready,
                qr: data.qr || null
              })
              if (data.error) {
                toast.error(`Error en servidor WhatsApp: ${data.error}`)
              }
            }
          } else {
            if (active) {
              setWhatsappStatus({ ready: false, qr: null })
            }
          }
        } catch {
          if (active) {
            setWhatsappStatus({ ready: false, qr: null })
          }
        }
      }
      poll()
      const interval = setInterval(poll, 4000)
      return () => {
        active = false
        clearInterval(interval)
      }
    }
  }, [ipcRenderer])

  useEffect(() => {
    if (!ipcRenderer) return
    ipcRenderer
      .invoke("whatsapp:get-config")
      .then((config: any) => {
        const template = normalizeReminderTemplate(config?.defaultReminderMessageTemplate)
        if (template) {
          setDefaultReminderMessageTemplate(template)
        }
      })
      .catch((error: any) => {
        console.error("Error loading WhatsApp config:", error)
      })
  }, [ipcRenderer])

  useEffect(() => {
    if (!whatsappStatus.qr) {
      setWhatsappQrDataUrl("")
      return
    }
    QRCode.toDataURL(whatsappStatus.qr)
      .then((url) => setWhatsappQrDataUrl(url))
      .catch((err) => console.error("QR error:", err))
  }, [whatsappStatus.qr])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (lastAutoSendDate) {
      window.localStorage.setItem("lastAutoSendDate", lastAutoSendDate)
    }
  }, [lastAutoSendDate])

  useEffect(() => {
    if (isEditDialogOpen && currentCustomer) {
      setSelectedCreditDevice(currentCustomer.creditDevice || "none")
      setReminderEnabled(currentCustomer.reminderEnabled ?? false)
      setReminderIntervalDays(normalizeReminderIntervalDays(currentCustomer.reminderIntervalDays))
      setReminderMessage(currentCustomer.reminderMessage ?? "")
    }
  }, [isEditDialogOpen, currentCustomer])

  const getCustomerSalesHistory = useCallback(
    (customer: Customer) => sales.filter((sale) => isGeneralCustomerSale(sale, customer)),
    [sales],
  )

  const getCustomerPayments = useCallback(
    (customerId: string) => payments.filter((payment) => payment.customerId === customerId),
    [payments],
  )

  const loadCustomerAccountData = useCallback(
    (customer: Customer) => {
      const activeCustomer = customers.find((item) => item.id === customer.id) ?? customer
      setCurrentCustomer(activeCustomer)
      setCustomerHistory(getCustomerSalesHistory(activeCustomer))
      setCustomerPayments(getCustomerPayments(activeCustomer.id))
      return activeCustomer
    },
    [customers, getCustomerPayments, getCustomerSalesHistory],
  )

  const handleOpenPaymentDialog = useCallback(
    (customer: Customer) => {
      loadCustomerAccountData(customer)
      setSelectedPaymentSaleIds([])
      setPaymentAmountDraft("")
      setPaymentMethodAbono("cash")
      setIsPaymentDialogOpen(true)
    },
    [loadCustomerAccountData],
  )

  useEffect(() => {
    if ((!isHistoryDialogOpen && !isPaymentDialogOpen) || !currentCustomer) return

    const activeCustomer = customers.find((customer) => customer.id === currentCustomer.id) ?? currentCustomer
    const nextHistory = getCustomerSalesHistory(activeCustomer)
    setCustomerHistory(nextHistory)
    setCustomerPayments(getCustomerPayments(activeCustomer.id))

    if (activeCustomer !== currentCustomer) {
      setCurrentCustomer(activeCustomer)
    }
  }, [
    customers,
    currentCustomer,
    getCustomerPayments,
    getCustomerSalesHistory,
    isHistoryDialogOpen,
    isPaymentDialogOpen,
  ])

  useEffect(() => {
    if (!currentCustomer) return
    const freshCustomer = customers.find((customer) => customer.id === currentCustomer.id)
    if (freshCustomer && freshCustomer !== currentCustomer) {
      setCurrentCustomer(freshCustomer)
    }
  }, [customers, currentCustomer])

  const handleOpenReminderDialog = (customer?: Customer | null) => {
    if (whatsappBotDisabled) {
      toast.error(whatsappAccessMessage)
      return
    }
    if (customer) {
      setCurrentCustomer(customer)
      setReminderEnabled(customer.reminderEnabled ?? false)
      setReminderIntervalDays(normalizeReminderIntervalDays(customer.reminderIntervalDays))
      setReminderMessage(customer.reminderMessage ?? "")
      setReminderQuickEditCustomerId(customer.id)
    } else {
      setReminderQuickEditCustomerId(null)
    }
    setIsReminderDialogOpen(true)
  }

  const handleCloseReminderDialog = async () => {
    if (reminderQuickEditCustomerId) {
      const normalizedReminderMessage = reminderMessage.trim()
      const normalizedReminderIntervalDays = normalizeReminderIntervalDays(reminderIntervalDays)
      await updateCustomer(reminderQuickEditCustomerId, {
        reminderEnabled,
        reminderIntervalDays: normalizedReminderIntervalDays,
        reminderMessage: normalizedReminderMessage.length > 0 ? normalizedReminderMessage : null,
      })
      setCurrentCustomer(null)
    }
    setReminderQuickEditCustomerId(null)
    setIsReminderDialogOpen(false)
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.cedula.includes(searchTerm) ||
      customer.phone.includes(searchTerm),
  )

  const isEligibleForReminder = (customer: Customer) =>
    (customer.reminderEnabled ?? false) &&
    (customer.phone || "").trim().length > 0 &&
    (customer.debt || 0) > 0

  const selectedCustomers = customers.filter((customer) => selectedCustomerIds.includes(customer.id))
  const eligibleSelectedCustomers = selectedCustomers.filter(isEligibleForReminder)
  const eligibleAllCustomers = customers.filter(isEligibleForReminder)
  const selectedCount = selectedCustomerIds.length
  const skippedNoPhoneCount = selectedCustomers.filter((customer) => (customer.phone || "").trim().length === 0).length
  const skippedNoDebtCount = selectedCustomers.filter((customer) => (customer.debt || 0) <= 0).length
  const skippedDisabledCount = selectedCustomers.filter((customer) => !(customer.reminderEnabled ?? false)).length

  const scopedCustomers = sendScope === "all" ? eligibleAllCustomers : selectedCustomers

  const allFilteredSelected =
    canEdit &&
    filteredCustomers.length > 0 &&
    filteredCustomers.every((customer) => selectedCustomerIds.includes(customer.id))
  const someFilteredSelected =
    canEdit && filteredCustomers.some((customer) => selectedCustomerIds.includes(customer.id))

  const toggleSelectAll = (checked: boolean) => {
    if (!canEdit) return
    if (checked) {
      setSelectedCustomerIds(filteredCustomers.map((customer) => customer.id))
    } else {
      setSelectedCustomerIds([])
    }
  }

  const toggleSelectCustomer = (id: string, checked: boolean) => {
    if (!canEdit) return
    setSelectedCustomerIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev
        return [...prev, id]
      }
      return prev.filter((customerId) => customerId !== id)
    })
  }

  const handleSendNowReminders = () => {
    if (!isAdmin || isSendingReminders || Boolean(sendingSingleCustomerId)) return
    if (whatsappBotDisabled) {
      toast.error(whatsappAccessMessage)
      return
    }
    if (eligibleAllCustomers.length === 0) {
      toast.error("No hay clientes elegibles para enviar (deuda, teléfono y recordatorio activo).")
      return
    }
    setManualSendMessageTemplate("")
    setIsSendOptionsDialogOpen(true)
  }

  const handleConnectWhatsapp = async () => {
    if (isWhatsappConnecting || whatsappStatus.ready) return
    if (whatsappBotDisabled) {
      toast.error(whatsappAccessMessage)
      return
    }
    setIsWhatsappConnecting(true)
    try {
      if (ipcRenderer) {
        const status = await ipcRenderer.invoke("whatsapp:init")
        if (status) setWhatsappStatus(status)
      } else {
        const localWebhookUrl = getLocalWebhookUrl()
        const localHealthUrl = getLocalHealthUrl(localWebhookUrl)
            try {
            const res = await fetch(localHealthUrl, { method: "GET" })
          if (res.ok) {
            const data = await res.json()
            setWhatsappStatus({
              ready: data.ready,
              qr: data.qr || null
            })
            if (data.ready) {
              toast.success("WhatsApp ya está listo.")
            } else if (data.qr) {
              toast.success("Código QR obtenido. Escanéalo en pantalla.")
            } else {
              toast.info("WhatsApp se está iniciando en el servidor bot. Espera un momento...")
            }
          } else {
            toast.error("El servidor de WhatsApp no respondió correctamente.")
          }
        } catch {
          toast.error("El servidor de WhatsApp no está corriendo. Ejecuta 'npm run bot' en una terminal nueva o usa la app de escritorio.")
        }
      }
    } catch (err) {
      console.error("Error al iniciar WhatsApp:", err)
      toast.error("No se pudo iniciar WhatsApp. Intenta de nuevo.")
    } finally {
      setIsWhatsappConnecting(false)
    }
  }

  const sendRealtimeMessages = useCallback(
    async (targets: Customer[], options?: { notify?: boolean; messageTemplate?: string | null }) => {
      const notify = options?.notify !== false
      const normalizedOneTimeTemplate = normalizeReminderTemplate(options?.messageTemplate)
      if (whatsappBotDisabled) {
        if (notify) {
          toast.error(whatsappAccessMessage)
        }
        return { error: "access_denied", sentIds: [] as string[] }
      }
      const localWebhookUrl = getLocalWebhookUrl()
      const localWebhookSecret = getWebhookSecret()
      const localHealthUrl = getLocalHealthUrl(localWebhookUrl)

      const payload = targets.map((customer) => {
        const customTemplate = normalizeReminderTemplate(customer.reminderMessage)
        const template = normalizedOneTimeTemplate || customTemplate || defaultReminderMessageTemplate
        const message = applyReminderTemplate(template, customer)
        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          debt: customer.debt,
          message,
        }
      })

      if (ipcRenderer) {
        if (!whatsappStatus.ready) {
          if (notify) {
            toast.error("WhatsApp no está conectado. Escanea el QR.")
            setIsWhatsappDialogOpen(true)
          }
          return { error: "not_ready", sentIds: [] as string[] }
        }

        const response = await ipcRenderer.invoke("whatsapp:send", payload)
        if (response?.error === "not_ready") {
          if (notify) {
            toast.error("WhatsApp no está conectado. Escanea el QR.")
            setIsWhatsappDialogOpen(true)
          }
          return { error: "not_ready", sentIds: [] as string[] }
        }

        const results = response?.results || []
        const sentIds = results.filter((item: any) => item.ok).map((item: any) => item.id)
        const failedNotOnWhatsapp = results.filter((item: any) => item.reason === "not_on_whatsapp").length
        const failedSend = results.filter((item: any) => item.reason === "send_failed").length
        const failedMissingPhone = results.filter((item: any) => item.reason === "missing_phone").length

        if (sentIds.length > 0) {
          const nowIso = new Date().toISOString()
          await Promise.all(
            sentIds.map((id: string) =>
              updateCustomer(id, {
                reminderLastSentAt: nowIso,
              }),
            ),
          )
        }

        if (notify) {
          if (sentIds.length > 0) {
            toast.success(`Mensajes enviados: ${sentIds.length}.`)
          }
          if (failedNotOnWhatsapp > 0 || failedSend > 0 || failedMissingPhone > 0) {
            toast(
              `No enviados: ${failedMissingPhone} sin teléfono, ${failedNotOnWhatsapp} no están en WhatsApp, ${failedSend} fallaron.`,
            )
          }
        }

        return { sentIds, failedNotOnWhatsapp, failedSend, failedMissingPhone }
      }

      try {
        const localHealth = await fetch(localHealthUrl, { method: "GET" })
          .then(async (res) => {
            if (!res.ok) return { ok: false, ready: false }
            try {
              const data = await res.json()
              return { ok: true, ready: data?.ready !== false }
            } catch {
              return { ok: true, ready: true }
            }
          })
          .catch(() => ({ ok: false, ready: false }))

        if (localHealth.ok && !localHealth.ready) {
          if (notify) {
            toast.error("WhatsApp no está conectado. Abre whatsapp-bot y escanea el QR.")
          }
          return { error: "not_ready", sentIds: [] as string[] }
        }

        if (localHealth.ok && localHealth.ready) {
          const localResults = await Promise.all(
            payload.map(async (item) => {
              if (!item.phone) return { id: item.id, ok: false, reason: "missing_phone" }
              try {
                const response = await fetch(localWebhookUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(localWebhookSecret ? { "x-webhook-secret": localWebhookSecret } : {}),
                  },
                  body: JSON.stringify({
                    phone: item.phone,
                    ...(item.message ? { message: item.message } : {}),
                    customer: { id: item.id, name: item.name, debt: item.debt, phone: item.phone },
                  }),
                })
                if (!response.ok) {
                  return { id: item.id, ok: false, reason: "send_failed" }
                }
                return { id: item.id, ok: true }
              } catch {
                return { id: item.id, ok: false, reason: "send_failed" }
              }
            }),
          )

          const sentIds = localResults.filter((item: any) => item.ok).map((item: any) => item.id)
          const failedMissingPhone = localResults.filter((item: any) => item.reason === "missing_phone").length
          const failedSend = localResults.filter((item: any) => item.reason === "send_failed").length

          if (sentIds.length > 0) {
            const nowIso = new Date().toISOString()
            await Promise.all(
              sentIds.map((id: string) =>
                updateCustomer(id, {
                  reminderLastSentAt: nowIso,
                }),
              ),
            )
          }

          if (notify) {
            if (sentIds.length > 0) {
              toast.success(`Mensajes enviados: ${sentIds.length}.`)
            }
            if (failedSend > 0 || failedMissingPhone > 0) {
              toast(`No enviados: ${failedMissingPhone} sin teléfono, ${failedSend} fallaron.`)
            }
          }

          return {
            sentIds,
            failedNotOnWhatsapp: 0,
            failedSend,
            failedMissingPhone,
          }
        }

        const supabase = createClient()
        const { data, error } = await supabase.functions.invoke("send-payment-reminders", {
          body: { targets: payload, source: "manual" },
        })

        if (error) {
          console.error("Error enviando recordatorios:", error)
          if (notify) {
            toast.error("No se pudo enviar los recordatorios desde la nube.")
          }
          return { error: "send_failed", sentIds: [] as string[] }
        }

        const results = data?.results || []
        const sentIds = results.filter((item: any) => item.ok).map((item: any) => item.id)
        const failedNotOnWhatsapp = results.filter((item: any) => item.reason === "not_on_whatsapp").length
        const failedSend = results.filter((item: any) => item.reason === "send_failed").length
        const failedMissingPhone = results.filter((item: any) => item.reason === "missing_phone").length

        if (sentIds.length > 0) {
          const nowIso = new Date().toISOString()
          await Promise.all(
            sentIds.map((id: string) =>
              updateCustomer(id, {
                reminderLastSentAt: nowIso,
              }),
            ),
          )
        }

        if (notify) {
          if (sentIds.length > 0) {
            toast.success(`Mensajes enviados: ${sentIds.length}.`)
          }
          if (failedNotOnWhatsapp > 0 || failedSend > 0 || failedMissingPhone > 0) {
            toast(
              `No enviados: ${failedMissingPhone} sin teléfono, ${failedNotOnWhatsapp} no están en WhatsApp, ${failedSend} fallaron.`,
            )
          }
        }

        return { sentIds, failedNotOnWhatsapp, failedSend, failedMissingPhone }
      } catch (err) {
        console.error("Error enviando recordatorios:", err)
        if (notify) {
          toast.error("No se pudo enviar los recordatorios desde la nube.")
        }
        return { error: "send_failed", sentIds: [] as string[] }
      }
    },
    [
      ipcRenderer,
      updateCustomer,
      whatsappStatus.ready,
      whatsappBotDisabled,
      whatsappAccessMessage,
      defaultReminderMessageTemplate,
    ],
  )

  const handleSendOneFromOptions = () => {
    if (selectedCount !== 1) {
      toast.error("Selecciona solo 1 cliente para esta opción.")
      return
    }
    if (eligibleSelectedCustomers.length !== 1) {
      toast.error("El cliente seleccionado debe tener deuda, telefono y recordatorio activo.")
      return
    }
    setSendScope("selected")
    setIsSendOptionsDialogOpen(false)
    setIsConfirmRemindersOpen(true)
  }

  const handleSendAllManualFromOptions = () => {
    if (eligibleAllCustomers.length === 0) {
      toast.error("No hay clientes elegibles para enviar.")
      return
    }
    setSendScope("all")
    setIsSendOptionsDialogOpen(false)
    setIsConfirmRemindersOpen(true)
  }

  const handleSendAllAutomaticFromOptions = async () => {
    if (isSendingReminders || Boolean(sendingSingleCustomerId)) return
    if (eligibleAllCustomers.length === 0) {
      toast.error("No hay clientes elegibles para enviar.")
      return
    }
    setIsSendOptionsDialogOpen(false)
    setIsSendingReminders(true)
    try {
      const result = await sendRealtimeMessages(eligibleAllCustomers, {
        messageTemplate: manualSendMessageTemplate,
      })
      if (result.error) return
      setSelectedCustomerIds([])
      setManualSendMessageTemplate("")
    } finally {
      setIsSendingReminders(false)
    }
  }

  useEffect(() => {
    if (!AUTO_SEND_ENABLED || !canUseWhatsappBot) return
    const interval = setInterval(() => {
      const now = new Date()
      if (!isAfterAutomaticReminderTime(now)) return
      const todayKey = getLocalDateKey(now)
      if (lastAutoSendDate === todayKey) return
      setLastAutoSendDate(todayKey)
      const dueCustomers = eligibleAllCustomers.filter((customer) => isCustomerDueForAutomaticReminder(customer, now))
      if (dueCustomers.length === 0) return
      sendRealtimeMessages(dueCustomers, { notify: false })
    }, 30000)

    return () => clearInterval(interval)
  }, [
    eligibleAllCustomers,
    ipcRenderer,
    lastAutoSendDate,
    sendRealtimeMessages,
    canUseWhatsappBot,
  ])

  const handleSendSingleReminder = async (customer: Customer) => {
    if (!isAdmin || isSendingReminders || Boolean(sendingSingleCustomerId)) return
    if (whatsappBotDisabled) {
      toast.error(whatsappAccessMessage)
      return
    }
    if (!isEligibleForReminder(customer)) {
      toast.error("Este cliente no cumple los requisitos para enviar recordatorio.")
      return
    }

    setSendingSingleCustomerId(customer.id)
    try {
      const result = await sendRealtimeMessages([customer], {
        messageTemplate: manualSendMessageTemplate,
      })
      if (result.error) return
      if (sendScope === "selected") {
        setSelectedCustomerIds((prev) => prev.filter((id) => id !== customer.id))
      }
    } finally {
      setSendingSingleCustomerId(null)
    }
  }

  const confirmSendSelectedReminders = async () => {
    if (!isAdmin || isSendingReminders) return
    if (whatsappBotDisabled) {
      toast.error(whatsappAccessMessage)
      setIsConfirmRemindersOpen(false)
      return
    }

    const targetCustomers = sendScope === "all" ? eligibleAllCustomers : selectedCustomers
    const eligibleTargets = sendScope === "all" ? eligibleAllCustomers : eligibleSelectedCustomers

    if (targetCustomers.length === 0) {
      toast.error("No hay clientes seleccionados.")
      setIsConfirmRemindersOpen(false)
      return
    }

    if (eligibleTargets.length === 0) {
      toast.error("No hay clientes elegibles para enviar (deuda, teléfono y recordatorio activo).")
      setIsConfirmRemindersOpen(false)
      return
    }

    setIsSendingReminders(true)
    try {
      const result = await sendRealtimeMessages(eligibleTargets, {
        messageTemplate: manualSendMessageTemplate,
      })
      if (result.error) {
        setIsConfirmRemindersOpen(false)
        return
      }
      if (sendScope === "selected" && (skippedNoPhoneCount > 0 || skippedNoDebtCount > 0 || skippedDisabledCount > 0)) {
        toast(
          `Se omitieron ${skippedNoPhoneCount} sin teléfono, ${skippedNoDebtCount} sin deuda y ${skippedDisabledCount} con recordatorio desactivado.`,
        )
      }
      setSelectedCustomerIds([])
      setManualSendMessageTemplate("")
      setIsConfirmRemindersOpen(false)
    } finally {
      setIsSendingReminders(false)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = (formData.get("name") as string) || "Cliente sin nombre"
    const cedula = (formData.get("cedula") as string) || null // Use null for empty cedula to avoid unique constraint
    const normalizedReminderMessage = reminderMessage.trim()
    const normalizedReminderIntervalDays = normalizeReminderIntervalDays(reminderIntervalDays)

    const customerData = {
      name,
      cedula: cedula || "", // Store context expects string currently, need to ensure safely handled or update store context
      phone: (formData.get("phone") as string) || "",
      email: (formData.get("email") as string) || "",
      address: (formData.get("address") as string) || "",
      status: currentCustomer?.status || "En proceso",
      creditDevice: selectedCreditDevice === "none" ? "" : selectedCreditDevice,
      notes: formData.get("notes") as string,
      debt: Number(formData.get("debt") || 0),
      totalPurchases: currentCustomer?.totalPurchases || 0,
      creditLimit: Number(formData.get("creditLimit") || 0),
      creditBalance: currentCustomer?.creditBalance || 0,
      reminderEnabled,
      reminderIntervalDays: normalizedReminderIntervalDays,
      reminderMessage: normalizedReminderMessage.length > 0 ? normalizedReminderMessage : null,
    }

    if (currentCustomer) {
      updateCustomer(currentCustomer.id, customerData)
      setIsEditDialogOpen(false)
    } else {
      if (!canAdd) {
        toast.error("No tienes permisos para agregar clientes.")
        return
      }
      addCustomer(customerData)
      setIsAddDialogOpen(false)
    }
    setCurrentCustomer(null)
    setSelectedCreditDevice("")
    setReminderMessage("")
  }

  const handlePaymentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!currentCustomer) return

    const formData = new FormData(e.currentTarget)
    const amount = Number(formData.get("amount"))
    const note = formData.get("note") as string
    const maxAllowedPayment = paymentDebtToDisplay

    if (amount <= 0) return
    if (amount > maxAllowedPayment) {
      alert("El monto no puede ser mayor a la deuda actual")
      return
    }

    const appliedSaleIds = [...selectedPaymentSaleIds]

    setPendingPayment({ amount, note, paymentMethod: paymentMethodAbono, appliedSaleIds })
    setIsConfirmPaymentDialogOpen(true)
  }

  const handleConfirmPayment = async () => {
    if (!currentCustomer || !pendingPayment) return

    const customerForReceipt = currentCustomer
    const allCustomerSales = sales.filter((sale) => isGeneralCustomerSale(sale, customerForReceipt))
    const paymentAllocationsPreview = allocatePaymentToInvoices(
      allCustomerSales,
      pendingPayment.amount,
      pendingPayment.appliedSaleIds,
    )

    const data = {
      customerId: currentCustomer.id,
      amount: pendingPayment.amount,
      previousDebt: currentCustomer.debt,
      remainingDebt: currentCustomer.debt - pendingPayment.amount,
      paymentMethod: pendingPayment.paymentMethod,
      note: pendingPayment.note,
      allocations: paymentAllocationsPreview.map((allocation) => ({
        saleId: allocation.saleId,
        invoiceNumber: allocation.invoiceNumber,
        appliedAmount: allocation.appliedAmount,
        pendingBefore: allocation.pendingAmount,
        pendingAfter: allocation.remainingAmount,
      })),
    }
    const customerName = currentCustomer.name

    setIsConfirmPaymentDialogOpen(false)
    setIsPaymentDialogOpen(false)
    setPendingPayment(null)
    setCurrentCustomer(null)
    setPaymentMethodAbono("cash")
    setPaymentAmountDraft("")

    setIsProcessingPayment(true)
    try {
      const savedPayment = await addPayment(data)

      if (paymentAllocationsPreview.length > 0) {
        const paidInvoices: string[] = []

        for (const allocation of paymentAllocationsPreview) {
          const sale = allCustomerSales.find((item) => item.id === allocation.saleId)
          if (!sale) continue

          const nextAmountPaid = Number(sale.amountPaid || 0) + allocation.appliedAmount
          const nextPending = Math.max(0, Number(sale.total || 0) - nextAmountPaid)
          const nextStatus: Sale["status"] = nextPending <= 0 ? "completada" : "credito"

          await updateSale(sale.id, {
            amountPaid: nextAmountPaid,
            status: nextStatus,
            creditResolved: nextPending <= 0,
          })

          if (nextPending <= 0) {
            paidInvoices.push(sale.invoiceNumber || sale.id)
          }
        }

        if (paidInvoices.length > 0) {
          toast.success(`Facturas pagadas: ${paidInvoices.join(", ")}`)
        }
      }

      setRecentPaymentReceipt({ payment: savedPayment, customer: customerForReceipt })
      toast.success(`Abono registrado exitosamente para ${customerName}`)
    } catch (err: any) {
      console.error("Error al registrar abono:", err)
      toast.error(err?.message || "Error al guardar el abono. Intente de nuevo.")
    } finally {
      setIsProcessingPayment(false)
      setSelectedPaymentSaleIds([])
    }
  }

  const handleConfirmDelete = () => {
    if (!customerToDelete) return
    deleteCustomer(customerToDelete.id)
    setIsConfirmDeleteDialogOpen(false)
    setCustomerToDelete(null)
  }

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return

    setIsDeletingPayment(true)
    try {
      await deletePayment(paymentToDelete.id)
      toast.success(`Abono ${paymentToDelete.invoiceNumber} eliminado correctamente`)
      setPaymentToDelete(null)
    } catch (err: any) {
      console.error("Error al eliminar abono:", err)
      toast.error(err?.message || "No se pudo eliminar el abono.")
    } finally {
      setIsDeletingPayment(false)
    }
  }

  const getCustomReportRange = useCallback(() => {
    if (reportPeriod === "general") {
      return {
        start: new Date(1970, 0, 1, 0, 0, 0, 0),
        end: new Date(9999, 11, 31, 23, 59, 59, 999),
      }
    }

    if (reportPeriod === "year") {
      const year = Number(reportYear)
      if (!Number.isInteger(year) || year < 1970 || year > 9999) return null
      return {
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999),
      }
    }

    if (reportPeriod === "month") {
      const parsedMonth = new Date(`${reportMonth}-01T00:00:00`)
      if (Number.isNaN(parsedMonth.getTime())) return null
      const year = parsedMonth.getFullYear()
      const month = parsedMonth.getMonth()
      return {
        start: new Date(year, month, 1, 0, 0, 0, 0),
        end: new Date(year, month + 1, 0, 23, 59, 59, 999),
      }
    }

    const parsedDay = new Date(`${reportDay}T00:00:00`)
    if (Number.isNaN(parsedDay.getTime())) return null
    const year = parsedDay.getFullYear()
    const month = parsedDay.getMonth()
    const day = parsedDay.getDate()
    return {
      start: new Date(year, month, day, 0, 0, 0, 0),
      end: new Date(year, month, day, 23, 59, 59, 999),
    }
  }, [reportDay, reportMonth, reportPeriod, reportYear])

  const getCurrentPeriodLabel = useCallback(() => {
    if (reportPeriod === "year") return `Año ${reportYear}`
    if (reportPeriod === "month") return `Mes ${reportMonth}`
    if (reportPeriod === "day") return `Día ${reportDay}`
    return REPORT_PERIOD_LABELS.general
  }, [reportDay, reportMonth, reportPeriod, reportYear])

  const generateReport = async () => {
    if (!currentCustomer) return

    const periodRange = getCustomReportRange()
    if (!periodRange) {
      toast.error("Seleccione un periodo válido para generar el PDF")
      return
    }

    setIsGeneratingReport(true)
    try {
      // En clientes, el reporte debe incluir exclusivamente compras a crédito.
      const history = sales.filter((sale) => {
        const saleDate = new Date(sale.date)
        if (Number.isNaN(saleDate.getTime())) return false
        if (saleDate < periodRange.start || saleDate > periodRange.end) return false
        return (
          isGeneralCustomerSale(sale, currentCustomer) &&
          (sale.status === "credito" ||
            sale.paymentMethod === "credit" ||
            sale.creditResolved ||
            getSaleCreditPendingAmount(sale) > 0)
        )
      })

      if (history.length === 0) {
        toast.error("No hay compras a crédito para generar el reporte")
        return
      }

      const reportRows: ReportRow[] = history
        .flatMap((sale) => {
          const saleDate = new Date(sale.date)
          const backupItems =
            sale.items.length > 0
              ? sale.items
              : [
                  {
                    name: "Sin detalle de productos",
                    quantity: 1,
                    sellPrice: sale.total,
                    customPrice: sale.total,
                    cartId: "fallback",
                    id: "manual::fallback",
                    sourceTable: "manual",
                    sourceId: "fallback",
                    sku: "fallback",
                    category: "",
                    stock: 0,
                    minStock: 0,
                    buyPrice: 0,
                    wholesalePrice: 0,
                    supplier: "",
                  },
                ]

          return backupItems.map((item) => {
            const quantity = Number(item.quantity ?? 0)
            const unitPrice = Number(item.customPrice ?? item.sellPrice ?? 0)

            return {
              invoice: sale.invoiceNumber || sale.id,
              date: saleDate,
              product: item.name || "Producto sin nombre",
              quantity,
              price: unitPrice,
              total: Math.round(quantity * unitPrice * 100) / 100,
              status: sale.status,
            }
          })
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      if (reportRows.length === 0) {
        toast.error("No hay detalles para mostrar en el periodo seleccionado")
        return
      }

      const periodLabel = getCurrentPeriodLabel()
      const reportTitle = `Reporte de Compras a Crédito - ${currentCustomer.name}`
      const fileName = `Reporte-Credito-${reportPeriod}-${currentCustomer.name.replace(/\s+/g, "_")}-${Date.now()}`

      const pdfBlob = await generateSalesReportPDF(
        reportRows,
        {
          customerName: currentCustomer.name,
          periodLabel,
          reportTitle,
        },
        formatCurrency,
      )

      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileName}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success("PDF descargado exitosamente")
    } catch (err: any) {
      console.error("Report Generation Error:", err)
      toast.error(`Error al generar el reporte: ${err.message || "Error fatal"}`)
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const getPendingCreditAmount = getSaleCreditPendingAmount

  const currentCustomerSales = useMemo(() => {
    if (!currentCustomer) return []
    const activeCustomer = customers.find((customer) => customer.id === currentCustomer.id) ?? currentCustomer
    return getCustomerSalesHistory(activeCustomer)
  }, [currentCustomer, customers, getCustomerSalesHistory])

  const paymentPendingInvoices = useMemo(
    () =>
      sortSalesByRecencyDesc(
        currentCustomerSales.filter((sale) => getPendingCreditAmount(sale) > 0),
      ),
    [currentCustomerSales],
  )

  const pendingDebtFromCustomerSales = useMemo(
    () => currentCustomerSales.reduce((acc, sale) => acc + getPendingCreditAmount(sale), 0),
    [currentCustomerSales],
  )

  const currentCustomerDebt = useMemo(() => Number(currentCustomer?.debt ?? 0), [currentCustomer?.debt])

  const paymentDebtToDisplay = useMemo(
    () => Math.max(currentCustomerDebt, pendingDebtFromCustomerSales),
    [currentCustomerDebt, pendingDebtFromCustomerSales],
  )

  const visibleCustomerHistory = useMemo(
    () =>
      customerHistory.filter((sale) =>
        shouldShowInCustomerPurchaseHistory(sale, { creditOnly: showOnlyCredit }),
      ),
    [customerHistory, showOnlyCredit],
  )

  const getPaymentAllocations = useCallback(
    (paymentId: string) => paymentAllocations.filter((allocation) => allocation.paymentId === paymentId),
    [paymentAllocations],
  )
  const paymentDraftAmountValue = useMemo(() => {
    const parsed = Number(paymentAmountDraft)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
  }, [paymentAmountDraft])
  const selectedInvoicesPendingTotal = useMemo(
    () =>
      currentCustomerSales
        .filter((sale) => selectedPaymentSaleIds.includes(sale.id))
        .reduce((acc, sale) => acc + getPendingCreditAmount(sale), 0),
    [currentCustomerSales, selectedPaymentSaleIds],
  )
  const projectedRemainingDebtAfterPayment = useMemo(
    () => Math.max(0, currentCustomerDebt - paymentDraftAmountValue),
    [currentCustomerDebt, paymentDraftAmountValue],
  )
  const oldestInvoicePending = useMemo(() => {
    const oldest = getFirstCreatedPendingSale(paymentPendingInvoices)
    return oldest ? getPendingCreditAmount(oldest) : 0
  }, [paymentPendingInvoices])
  const projectedSelectedInvoicesPendingAfterPayment = useMemo(() => {
    const basePending =
      selectedPaymentSaleIds.length > 0 ? selectedInvoicesPendingTotal : oldestInvoicePending
    return Math.max(0, basePending - paymentDraftAmountValue)
  }, [
    paymentDraftAmountValue,
    oldestInvoicePending,
    selectedInvoicesPendingTotal,
    selectedPaymentSaleIds.length,
  ])



  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-hidden px-2 pb-4 pt-2 sm:gap-6 sm:px-4 sm:pb-6 sm:pt-4 lg:px-6 lg:pb-6 lg:pt-6">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-lg font-bold sm:text-2xl">{customers.length}</div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Con Crédito Activo</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-lg font-bold sm:text-2xl">
              {customers.filter((c) => c.creditDevice && c.creditDevice.length > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Deuda Total</CardTitle>
            <CreditCard className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-lg font-bold sm:text-2xl">
              ${customers.reduce((acc, c) => acc + (c.debt || 0), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">En Proceso</CardTitle>
            <Users className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-lg font-bold sm:text-2xl">{customers.filter((c) => c.status === "En proceso").length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, cédula o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-h-11 pl-8"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Badge
            variant="outline"
            className={`w-full justify-center sm:w-auto ${whatsappStatus.ready ? "border-emerald-200 text-emerald-700" : ""}`}
          >
            WhatsApp: {whatsappStatus.ready ? "Conectado" : "Desconectado"}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setIsWhatsappDialogOpen(true)}
                  className="w-full min-h-11 gap-2 sm:w-auto"
                  disabled={whatsappBotDisabled}
                >
                  {whatsappStatus.ready ? "Conectado" : "Conectar"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{whatsappTooltipMessage}</TooltipContent>
          </Tooltip>
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleSendNowReminders}
              disabled={
                whatsappBotDisabled ||
                (selectedCount === 0 && eligibleAllCustomers.length === 0) ||
                isSendingReminders ||
                Boolean(sendingSingleCustomerId)
              }
              className="w-full gap-2 sm:w-auto"
            >
              {isSendingReminders && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar a todos
            </Button>
          )}
          {isAdmin && selectedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              Seleccionados: {selectedCount}. Puedes usar la opción "Enviar a 1".
            </span>
          )}
          {whatsappBotDisabled && (
            <span className={`w-full text-center text-xs sm:text-left ${whatsappAccessTone}`}>{whatsappAccessMessage}</span>
          )}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-md border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => toggleSelectAll(value === true)}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
              )}
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Dispositivo a Crédito</TableHead>
              <TableHead>Recordatorio</TableHead>
              <TableHead>Límite Crédito</TableHead>
              <TableHead>Deuda</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => (
              <TableRow key={customer.id}>
                {canEdit && (
                  <TableCell>
                    <Checkbox
                      checked={selectedCustomerIds.includes(customer.id)}
                      onCheckedChange={(value) => toggleSelectCustomer(customer.id, value === true)}
                      aria-label={`Seleccionar ${customer.name}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">ID: {customer.cedula}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        {customer.email}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {customer.creditDevice ? (
                    <span className="text-sm font-medium">{customer.creditDevice}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {customer.reminderEnabled ? (
                    <div className="flex flex-col text-sm">
                      <span className="font-medium">
                        Frecuencia: {getReminderFrequencyLabel(customer.reminderIntervalDays)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Último envío: {formatReminderLastSent(customer.reminderLastSentAt)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Desactivado</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {customer.creditLimit ? `$${customer.creditLimit.toLocaleString()}` : "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-medium text-red-500">${customer.debt.toLocaleString()}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReminderDialog(customer)}
                        disabled={whatsappBotDisabled}
                      >
                        Configurar
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleOpenPaymentDialog(customer)}
                          className="cursor-pointer"
                        >
                          <Wallet className="mr-2 h-4 w-4" />
                          Abonar
                        </DropdownMenuItem>
                        {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canEdit) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCurrentCustomer(customer)
                              setIsEditDialogOpen(true)
                            }}
                            className="cursor-pointer"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            loadCustomerAccountData(customer)
                            setShowOnlyCredit(false)
                            setIsHistoryDialogOpen(true)
                          }}
                        >
                          <History className="mr-2 h-4 w-4" />
                          Ver Historial
                        </DropdownMenuItem>
                        {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canDelete) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setCustomerToDelete(customer)
                              setIsConfirmDeleteDialogOpen(true)
                            }}
                            className="text-red-500 cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 lg:hidden">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="overflow-hidden rounded-lg border p-3 shadow-sm">
            <div className="flex items-start gap-3">
              {canEdit && (
                <Checkbox
                  checked={selectedCustomerIds.includes(customer.id)}
                  onCheckedChange={(value) => toggleSelectCustomer(customer.id, value === true)}
                  aria-label={`Seleccionar ${customer.name}`}
                  className="mt-1"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block font-semibold break-words">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">ID: {customer.cedula || "-"}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Deuda</div>
                    <div className="font-semibold text-red-500">${customer.debt.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">Contacto</div>
                    <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <span className="break-words text-foreground">{customer.phone || "-"}</span>
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          <span className="break-words text-foreground">{customer.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">Dispositivo</div>
                    <div className="mt-1 text-sm font-medium break-words">{customer.creditDevice || "Sin dispositivo"}</div>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">Crédito</div>
                    <div className="mt-1 text-sm font-medium">
                      {customer.creditLimit ? `$${customer.creditLimit.toLocaleString()}` : "-"}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">Recordatorio</div>
                    <div className="mt-1 text-sm font-medium">
                      {customer.reminderEnabled
                        ? getReminderFrequencyLabel(customer.reminderIntervalDays)
                        : "Desactivado"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenReminderDialog(customer)}
                      disabled={whatsappBotDisabled}
                      className="w-full min-h-11 sm:flex-1"
                    >
                      Configurar
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-11 w-full justify-between px-3 sm:w-auto sm:min-w-[120px]">
                        Acciones
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenPaymentDialog(customer)} className="cursor-pointer">
                        <Wallet className="mr-2 h-4 w-4" />
                        Abonar
                      </DropdownMenuItem>
                      {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canEdit) && (
                        <DropdownMenuItem
                          onClick={() => {
                            setCurrentCustomer(customer)
                            setIsEditDialogOpen(true)
                          }}
                          className="cursor-pointer"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => {
                          loadCustomerAccountData(customer)
                          setShowOnlyCredit(false)
                          setIsHistoryDialogOpen(true)
                        }}
                      >
                        <History className="mr-2 h-4 w-4" />
                        Ver Historial
                      </DropdownMenuItem>
                      {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canDelete) && (
                        <DropdownMenuItem
                          onClick={() => {
                            setCustomerToDelete(customer)
                            setIsConfirmDeleteDialogOpen(true)
                          }}
                          className="text-red-500 cursor-pointer"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) {
            setSelectedCreditDevice("")
            setCurrentCustomer(null)
            setReminderEnabled(false)
            setReminderIntervalDays(DEFAULT_REMINDER_INTERVAL_DAYS)
            setReminderMessage("")
            setIsReminderDialogOpen(false)
          } else if (currentCustomer) {
            setSelectedCreditDevice(currentCustomer.creditDevice || "none")
            setReminderEnabled(currentCustomer.reminderEnabled ?? false)
            setReminderIntervalDays(normalizeReminderIntervalDays(currentCustomer.reminderIntervalDays))
            setReminderMessage(currentCustomer.reminderMessage ?? "")
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Modifique los datos del cliente seleccionado.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre Completo</Label>
                <Input id="edit-name" name="name" defaultValue={currentCustomer?.name} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cedula">Cédula / ID</Label>
                <Input id="edit-cedula" name="cedula" defaultValue={currentCustomer?.cedula} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input id="edit-phone" name="phone" defaultValue={currentCustomer?.phone} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Correo Electrónico</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={currentCustomer?.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-creditDevice">Dispositivo a Crédito</Label>
                <Popover open={openEditCombobox} onOpenChange={setOpenEditCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openEditCombobox}
                      className="w-full justify-between"
                    >
                      {selectedCreditDevice && selectedCreditDevice !== "none"
                        ? selectedCreditDevice
                        : "Seleccione un dispositivo..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(92vw,250px)] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar dispositivo..." />
                      <CommandList className="max-h-[400px] overflow-y-auto">
                        <CommandEmpty>No se encontraron dispositivos.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setSelectedCreditDevice("none")
                              setOpenEditCombobox(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCreditDevice === "none" ? "opacity-100" : "opacity-0"
                              )}
                            />
                            Ninguno
                          </CommandItem>
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.name}
                              onSelect={() => {
                                setSelectedCreditDevice(product.name)
                                setOpenEditCombobox(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCreditDevice === product.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {product.name} {product.capacity ? `- ${product.capacity}` : ""} (Stock: {product.stock})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-debt">Deuda Actual</Label>
                <Input id="edit-debt" name="debt" type="number" min="0" defaultValue={currentCustomer?.debt} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-creditLimit">Límite de Crédito</Label>
                <Input id="edit-creditLimit" name="creditLimit" type="number" min="0" defaultValue={currentCustomer?.creditLimit} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Dirección</Label>
              <Input id="edit-address" name="address" defaultValue={currentCustomer?.address} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notas Internas</Label>
              <Textarea id="edit-notes" name="notes" defaultValue={currentCustomer?.notes} />
            </div>
            <DialogFooter>
              <Button type="submit">Guardar Cambios</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="!w-[92vw] !max-w-[1100px] !max-h-[96vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial - {currentCustomer?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={showOnlyCredit ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyCredit(!showOnlyCredit)}
                >
                  {showOnlyCredit ? "Mostrando Créditos" : "Todas las Ventas"}
                </Button>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Select value={reportPeriod} onValueChange={(value: string) => setReportPeriod(value as ReportPeriod)}>
                  <SelectTrigger className="h-8 w-full md:w-[210px]">
                    <SelectValue placeholder="Periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Todo el historial</SelectItem>
                    <SelectItem value="year">Año</SelectItem>
                    <SelectItem value="month">Mes</SelectItem>
                    <SelectItem value="day">Día</SelectItem>
                  </SelectContent>
                </Select>
                {reportPeriod === "year" && (
                  <Input
                    type="number"
                    min={1970}
                    max={9999}
                    value={reportYear}
                    onChange={(event) => setReportYear(event.target.value)}
                    className="h-8 w-full md:w-[120px]"
                    placeholder="Año"
                  />
                )}
                {reportPeriod === "month" && (
                  <Input
                    type="month"
                    value={reportMonth}
                    onChange={(event) => setReportMonth(event.target.value)}
                    className="h-8 w-full md:w-[160px]"
                  />
                )}
                {reportPeriod === "day" && (
                  <Input
                    type="date"
                    value={reportDay}
                    onChange={(event) => setReportDay(event.target.value)}
                    className="h-8 w-full md:w-[170px]"
                  />
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1 md:w-auto"
                  onClick={generateReport}
                  disabled={isGeneratingReport}
                  title="Descargar PDF de compras a crédito"
                >
                  {isGeneratingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Descargar PDF
                </Button>
              </div>
            </div>

            <Tabs defaultValue="sales" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sales">Compras</TabsTrigger>
                <TabsTrigger value="payments">Pagos Realizados</TabsTrigger>
              </TabsList>

              <TabsContent value="sales" className="max-h-[70vh] overflow-auto">
                {visibleCustomerHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay compras {showOnlyCredit ? "a crédito pendientes " : ""}registradas para este cliente.
                  </div>
                ) : (
                  <>
                  <div className="hidden overflow-hidden rounded-md border lg:block">
                  <Table className="table-fixed">
                  <colgroup>
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "52%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción / Items</TableHead>
                        <TableHead className="whitespace-nowrap px-2">Total Venta</TableHead>
                        <TableHead className="whitespace-nowrap px-1">Pagado</TableHead>
                        <TableHead className="whitespace-nowrap px-1">Pendiente</TableHead>
                        <TableHead className="px-1 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCustomerHistory.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                            <TableCell className="min-w-0 whitespace-normal break-words">
                              <div className="flex flex-col gap-1">
                                {sale.items.length > 0 ? (
                                  sale.items.map((item, index) => (
                                    <span key={item.name + index} className="block whitespace-normal break-words">
                                      {item.name}
                                    </span>
                                  ))
                                ) : (
                                  <span>Sin descripción</span>
                                )}
                                <span className="text-xs text-muted-foreground">{sale.items.length} producto{sale.items.length !== 1 ? "s" : ""}</span>
                                <FacturaPagada sale={sale} />
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2">${sale.total.toLocaleString()}</TableCell>
                            <TableCell className="whitespace-nowrap px-1">
                              <Pagado sale={sale} />
                            </TableCell>
                            <TableCell
                              className={`whitespace-nowrap px-1 ${
                                getPendingCreditAmount(sale) > 0
                                  ? "font-medium text-red-600"
                                  : ""
                              }`}
                            >
                              {getPendingCreditAmount(sale) > 0
                                ? `$${getPendingCreditAmount(sale).toLocaleString()}`
                                : sale.paymentMethod === "credit"
                                  ? "Pagada"
                                  : "-"}
                            </TableCell>
                            <TableCell className="px-1 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver Detalles"
                                  onClick={() => setSelectedSaleDetail(sale)}
                                >
                                  <Eye className="h-4 w-4 text-blue-600" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Eliminar"
                                    onClick={async () => {
                                      if (window.confirm(`¿Eliminar la factura ${sale.invoiceNumber}?`)) {
                                        try {
                                          await deleteSale(sale.id)
                                          setCustomerHistory((prev) => prev.filter((s) => s.id !== sale.id))
                                        } catch (error) {
                                          console.error("Error deleting sale:", error)
                                        }
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  </div>
                  <div className="space-y-3 lg:hidden">
                    {visibleCustomerHistory.map((sale) => (
                      <div key={sale.id} className="rounded-lg border p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">
                              {sale.items.length > 0 ? (
                                sale.items.map((item, index) => <span key={item.name + index} className="block">{item.name}</span>)
                              ) : (
                                <span>Sin descripción</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{new Date(sale.date).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Total</div>
                            <div className="font-semibold">${sale.total.toLocaleString()}</div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <div className="rounded-md bg-muted p-2">
                            <div className="text-xs text-muted-foreground">Items</div>
                            <div className="font-medium">{sale.items.length} productos</div>
                          </div>
                          <div className="rounded-md bg-muted p-2">
                            <div className="text-xs text-muted-foreground">Pendiente</div>
                            <div className={`font-medium ${getPendingCreditAmount(sale) > 0 ? "text-red-600" : ""}`}>
                              {getPendingCreditAmount(sale) > 0
                                ? `$${getPendingCreditAmount(sale).toLocaleString()}`
                                : sale.paymentMethod === "credit"
                                  ? "Pagada"
                                  : "-"}
                            </div>
                          </div>
                          <div className="rounded-md bg-muted p-2 col-span-2">
                            <div className="text-xs text-muted-foreground">Estado de pago</div>
                            <div className="mt-1">
                              <Pagado sale={sale} />
                              <div className="mt-1">
                                <FacturaPagada sale={sale} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            title="Ver Detalles"
                            onClick={() => setSelectedSaleDetail(sale)}
                            className="flex-1"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver
                          </Button>
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Eliminar"
                              onClick={async () => {
                                if (window.confirm(`Â¿Eliminar la factura ${sale.invoiceNumber}?`)) {
                                  try {
                                    await deleteSale(sale.id)
                                    setCustomerHistory((prev) => prev.filter((s) => s.id !== sale.id))
                                  } catch (error) {
                                    console.error("Error deleting sale:", error)
                                  }
                                }
                              }}
                              className="flex-1"
                            >
                              <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="payments" className="max-h-[60vh] overflow-auto">
                {customerPayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay pagos registrados para este cliente.
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-hidden rounded-md border lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Factura</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Deuda Restante</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerPayments.map((payment) => {
                          const allocations = getPaymentAllocations(payment.id)
                          return (
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span>{payment.invoiceNumber}</span>
                                {allocations.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {allocations
                                      .map(
                                        (allocation) =>
                                          `${allocation.invoiceNumber}: $${allocation.appliedAmount.toLocaleString()}`,
                                      )
                                      .join(" · ")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-green-600">${payment.amount.toLocaleString()}</TableCell>
                            <TableCell>${payment.remainingDebt.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    currentCustomer &&
                                    void printPaymentInvoice(
                                      payment,
                                      currentCustomer,
                                      undefined,
                                      currentUser?.adminId
                                        ? ({
                                            ownerAdminId: currentUser.adminId,
                                            source: "pago",
                                            paymentId: payment.id,
                                          } satisfies SaveClientInvoiceOptions)
                                        : undefined,
                                    )
                                  }
                                >
                                  <Printer className="h-4 w-4 mr-2" />
                                  Imprimir
                                </Button>
                                {canDelete && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPaymentToDelete(payment)}
                                    disabled={customerPayments[0]?.id !== payment.id || isDeletingPayment}
                                  >
                                    {isDeletingPayment && paymentToDelete?.id === payment.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                                        Eliminar
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    </div>
                    <div className="space-y-3 lg:hidden">
                      {customerPayments.map((payment) => {
                        const allocations = getPaymentAllocations(payment.id)
                        return (
                          <div key={payment.id} className="rounded-lg border p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold">{payment.invoiceNumber}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(payment.date).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-muted-foreground">Monto</div>
                                <div className="font-semibold text-green-600">${payment.amount.toLocaleString()}</div>
                              </div>
                            </div>

                            {allocations.length > 0 && (
                              <div className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                                {allocations
                                  .map(
                                    (allocation) =>
                                      `${allocation.invoiceNumber}: $${allocation.appliedAmount.toLocaleString()}`,
                                  )
                                  .join(" · ")}
                              </div>
                            )}

                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                              <div className="rounded-md bg-muted p-2">
                                <div className="text-xs text-muted-foreground">Deuda restante</div>
                                <div className="font-medium">${payment.remainingDebt.toLocaleString()}</div>
                              </div>
                              <div className="rounded-md bg-muted p-2">
                                <div className="text-xs text-muted-foreground">Estado</div>
                                <div className="font-medium">Abono</div>
                              </div>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  currentCustomer &&
                                  void printPaymentInvoice(
                                    payment,
                                    currentCustomer,
                                    undefined,
                                    currentUser?.adminId
                                      ? ({
                                          ownerAdminId: currentUser.adminId,
                                          source: "pago",
                                          paymentId: payment.id,
                                        } satisfies SaveClientInvoiceOptions)
                                      : undefined,
                                  )
                                }
                                className="flex-1"
                              >
                                <Printer className="mr-2 h-4 w-4" />
                                Imprimir
                              </Button>
                              {canDelete && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPaymentToDelete(payment)}
                                  disabled={customerPayments[0]?.id !== payment.id || isDeletingPayment}
                                  className="flex-1"
                                >
                                  {isDeletingPayment && paymentToDelete?.id === payment.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                      Eliminar
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {canDelete && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Solo se puede eliminar el último abono registrado para no alterar el historial de deuda.
                      </p>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedSaleDetail} onOpenChange={(open) => !open && setSelectedSaleDetail(null)}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
            <DialogDescription>
              Fecha: {selectedSaleDetail ? new Date(selectedSaleDetail.date).toLocaleDateString("es-ES") : ""} - Método:{" "}
              {selectedSaleDetail?.paymentMethod === "cash"
                ? "Efectivo"
                : selectedSaleDetail?.paymentMethod === "card"
                  ? "Tarjeta"
                  : selectedSaleDetail?.paymentMethod === "credit"
                    ? "A Crédito"
                    : "Transferencia"}
            </DialogDescription>
          </DialogHeader>
          {selectedSaleDetail && (
            <div className="space-y-4">
              <div className="hidden overflow-hidden rounded-md border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSaleDetail.items.map((item) => (
                      <TableRow key={item.cartId}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">${(item.customPrice ?? item.sellPrice).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${((item.customPrice ?? item.sellPrice) * item.quantity).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 lg:hidden">
                {selectedSaleDetail.items.map((item) => (
                  <div key={item.cartId} className="rounded-lg border p-3">
                    <div className="font-medium">{item.name}</div>
                    {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Cantidad</div>
                        <div className="font-medium">{item.quantity}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Precio unit.</div>
                        <div className="font-medium">${(item.customPrice ?? item.sellPrice).toLocaleString()}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2 col-span-2">
                        <div className="text-xs text-muted-foreground">Subtotal</div>
                        <div className="font-medium">
                          ${((item.customPrice ?? item.sellPrice) * item.quantity).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1">
                {selectedSaleDetail.paymentMethod !== "credit" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monto Pagado:</span>
                      <span>${selectedSaleDetail.amountPaid.toLocaleString()}</span>
                    </div>
                    {selectedSaleDetail.status === "credito" && (
                      <div className="flex justify-between text-sm text-red-600">
                        <span>Deuda Pendiente:</span>
                        <span>${getPendingCreditAmount(selectedSaleDetail).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedSaleDetail.change > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Cambio:</span>
                        <span>${selectedSaleDetail.change.toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                {selectedSaleDetail.paymentMethod === "credit" && selectedSaleDetail.status === "credito" && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Deuda Pendiente:</span>
                    <span>${getPendingCreditAmount(selectedSaleDetail).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1 border-t">
                  <span>Total</span>
                  <span>${selectedSaleDetail.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => {
        setIsPaymentDialogOpen(open)
        if (!open) {
          setPaymentMethodAbono("cash")
          setSelectedPaymentSaleIds([])
          setPaymentAmountDraft("")
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Abono</DialogTitle>
            <DialogDescription>
              Cliente: {currentCustomer?.name} <br />
              Deuda Actual: <span className="font-bold text-red-500">${currentCustomer?.debt.toLocaleString()}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border-2 border-emerald-400 bg-emerald-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Resumen de pago</p>
            <p className="text-sm">
              Dinero a pagar: <span className="font-bold">${paymentDraftAmountValue.toLocaleString()}</span>
            </p>
            <p className="text-sm">
              Deuda pendiente despues del pago:{" "}
              <span className="font-bold text-emerald-700">${projectedRemainingDebtAfterPayment.toLocaleString()}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Pendiente en facturas marcadas: ${projectedSelectedInvoicesPendingAfterPayment.toLocaleString()}
            </p>
          </div>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto a Abonar</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="1"
                max={currentCustomer?.debt}
                placeholder="0.00"
                value={paymentAmountDraft}
                onChange={(event) => setPaymentAmountDraft(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={paymentMethodAbono}
                onValueChange={(v) => setPaymentMethodAbono(v as "cash" | "card" | "transfer")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Nota (Opcional)</Label>
              <Textarea id="note" name="note" placeholder="Detalles del pago..." />
            </div>
            <div className="space-y-2">
              <Label>Facturas a pagar (opcional)</Label>
              <div className="max-h-36 overflow-auto rounded-md border p-2 space-y-2">
                {paymentPendingInvoices.map((sale) => (
                    <label key={sale.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedPaymentSaleIds.includes(sale.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPaymentSaleIds((prev) =>
                              checked
                                ? [...prev, sale.id]
                                : prev.filter((id) => id !== sale.id),
                            )
                          }}
                        />
                        <span className="flex flex-col">
                          <span>{sale.invoiceNumber}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatSaleCreatedDateTime(sale)}
                          </span>
                        </span>
                      </span>
                      <span className="font-medium text-red-600">
                        Pendiente: ${getPendingCreditAmount(sale).toLocaleString()}
                      </span>
                    </label>
                  ))}
                {paymentPendingInvoices.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay facturas pendientes a crédito.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                La lista muestra la más nueva primero. Sin seleccionar, el abono se aplica FIFO (primero la más antigua).
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">
                Registrar Pago
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recentPaymentReceipt} onOpenChange={(open) => !open && setRecentPaymentReceipt(null)}>
        <DialogContent className="w-[95vw] max-w-[420px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pago registrado</DialogTitle>
            <DialogDescription>El abono se guardó correctamente. Puedes imprimir el recibo ahora.</DialogDescription>
          </DialogHeader>
          {recentPaymentReceipt && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">{recentPaymentReceipt.customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. Recibo:</span>
                <span className="font-mono">{recentPaymentReceipt.payment.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto:</span>
                <span className="font-semibold text-green-600">${formatCurrency(recentPaymentReceipt.payment.amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Método:</span>
                <span>{recentPaymentReceipt.payment.paymentMethod === "cash" ? "Efectivo" : recentPaymentReceipt.payment.paymentMethod === "card" ? "Tarjeta" : "Transferencia"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecentPaymentReceipt(null)}>
              Cerrar
            </Button>
            <Button
              onClick={() =>
                recentPaymentReceipt &&
                void printPaymentInvoice(
                  recentPaymentReceipt.payment,
                  recentPaymentReceipt.customer,
                  undefined,
                  currentUser?.adminId
                    ? {
                        ownerAdminId: currentUser.adminId,
                        source: "pago",
                        paymentId: recentPaymentReceipt.payment.id,
                      }
                    : undefined,
                )
              }
            >
              Imprimir recibo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setSelectedCreditDevice("")
            setReminderEnabled(false)
            setReminderIntervalDays(DEFAULT_REMINDER_INTERVAL_DAYS)
            setReminderMessage("")
            setIsReminderDialogOpen(false)
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
            <DialogDescription>Complete los datos del nuevo cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input id="name" name="name" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cedula">Cédula / ID</Label>
                <Input id="cedula" name="cedula" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="creditDevice">Dispositivo a Crédito</Label>
                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCombobox}
                      className="w-full justify-between"
                    >
                      {selectedCreditDevice && selectedCreditDevice !== "none"
                        ? selectedCreditDevice
                        : "Seleccione un dispositivo..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(92vw,250px)] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar dispositivo..." />
                      <CommandList className="max-h-[400px] overflow-y-auto">
                        <CommandEmpty>No se encontraron dispositivos.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setSelectedCreditDevice("none")
                              setOpenCombobox(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCreditDevice === "none" ? "opacity-100" : "opacity-0"
                              )}
                            />
                            Ninguno
                          </CommandItem>
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.name}
                              onSelect={() => {
                                setSelectedCreditDevice(product.name)
                                setOpenCombobox(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCreditDevice === product.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {product.name} {product.capacity ? `- ${product.capacity}` : ""} (Stock: {product.stock})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt">Deuda Inicial</Label>
                <Input id="debt" name="debt" type="number" min="0" defaultValue="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="creditLimit">Límite de Crédito</Label>
                <Input id="creditLimit" name="creditLimit" type="number" min="0" defaultValue="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" name="address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas Internas</Label>
              <Textarea id="notes" name="notes" />
            </div>
            <div className="rounded-md border p-3 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Recordatorio de deuda</Label>
                <p className="text-xs text-muted-foreground">
                  {reminderEnabled
                    ? `Activado - Frecuencia: ${getReminderFrequencyLabel(reminderIntervalDays)} - Hora: 10:30 AM`
                    : "Desactivado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Último envío: {formatReminderLastSent(currentCustomer?.reminderLastSentAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Mensaje:{" "}
                  {reminderMessage.trim()
                    ? reminderMessage
                    : "Sin mensaje (se usará el mensaje por defecto)"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenReminderDialog()}
                disabled={whatsappBotDisabled}
              >
                Configurar
              </Button>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!canAdd}>
                Agregar Cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isReminderDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsReminderDialogOpen(true)
            return
          }
          void handleCloseReminderDialog()
        }}
      >
        <DialogContent className="w-[95vw] max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recordatorio de deuda</DialogTitle>
            <DialogDescription>
              Envía recordatorios automáticos solo si la deuda es mayor a 0. Todos salen a las 10:30 AM.
            </DialogDescription>
          </DialogHeader>
          {whatsappBotDisabled && (
            <div className={`rounded-md border px-3 py-2 text-xs ${whatsappAccessTone}`}>
              {whatsappAccessMessage}
            </div>
          )}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Recordatorio de deuda</Label>
                <p className="text-xs text-muted-foreground">
                  Selecciona cada cuántos días se enviará automáticamente a las 10:30 AM.
                </p>
              </div>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
                disabled={whatsappBotDisabled}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Select
                  value={String(reminderIntervalDays)}
                  onValueChange={(value: string) => setReminderIntervalDays(normalizeReminderIntervalDays(value))}
                  disabled={!reminderEnabled || whatsappBotDisabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Último envío</Label>
                <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  {formatReminderLastSent(currentCustomer?.reminderLastSentAt)}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mensaje del recordatorio</Label>
              <Textarea
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                placeholder="Escribe el mensaje del recordatorio..."
                disabled={!reminderEnabled || whatsappBotDisabled}
                className="min-h-[90px]"
              />
              <p className="text-xs text-muted-foreground">
                Variables disponibles: {`{{name}}`}, {`{{debt}}`} y {`{{phone}}`}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void handleCloseReminderDialog()}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isConfirmPaymentDialogOpen} onOpenChange={setIsConfirmPaymentDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Pago</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea registrar un pago de <span className="font-bold text-green-600">${pendingPayment?.amount.toLocaleString()}</span> para el cliente <span className="font-bold">{currentCustomer?.name}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Deuda Actual:</span>
              <span>${currentCustomer?.debt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Monto a Pagar:</span>
              <span className="text-green-600">-${pendingPayment?.amount.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Deuda Restante:</span>
              <span className="text-red-500">${((currentCustomer?.debt || 0) - (pendingPayment?.amount || 0)).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsConfirmPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPayment} disabled={isProcessingPayment} className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]">
              {isProcessingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Confirmar y Registrar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!paymentToDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingPayment) {
            setPaymentToDelete(null)
          }
        }}
      >
        <AlertDialogContent className="w-[95vw] max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar abono</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el abono <span className="font-bold">{paymentToDelete?.invoiceNumber}</span> del cliente{" "}
              <span className="font-bold">{currentCustomer?.name}</span> y la deuda se restaurará por ese monto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Monto del abono:</span>
              <span className="font-medium text-green-600">
                ${paymentToDelete ? paymentToDelete.amount.toLocaleString() : "0"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Deuda actual:</span>
              <span>${currentCustomer ? currentCustomer.debt.toLocaleString() : "0"}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Deuda restaurada:</span>
              <span className="text-red-500">
                $
                {currentCustomer && paymentToDelete
                  ? (currentCustomer.debt + paymentToDelete.amount).toLocaleString()
                  : "0"}
              </span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPayment}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDeletePayment()
              }}
              disabled={isDeletingPayment}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeletingPayment ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Eliminando...
                </span>
              ) : (
                "Eliminar abono"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isSendOptionsDialogOpen} onOpenChange={setIsSendOptionsDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Opciones de envío</DialogTitle>
            <DialogDescription>
              Elige si quieres enviar a 1 persona, revisar y confirmar a todos, o enviar a todos de forma automática.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                Elegibles: {eligibleAllCustomers.length}
              </Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-600">
                Seleccionados: {selectedCount}
              </Badge>
            </div>
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSendOneFromOptions}
                disabled={
                  selectedCount !== 1 ||
                  eligibleSelectedCustomers.length !== 1 ||
                  isSendingReminders ||
                  Boolean(sendingSingleCustomerId)
                }
              >
                Enviar a 1 persona
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendAllManualFromOptions}
                disabled={eligibleAllCustomers.length === 0 || isSendingReminders || Boolean(sendingSingleCustomerId)}
              >
                Enviar a todos (manual)
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => void handleSendAllAutomaticFromOptions()}
                disabled={eligibleAllCustomers.length === 0 || isSendingReminders || Boolean(sendingSingleCustomerId)}
              >
                {isSendingReminders ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  "Enviar a todos automático"
                )}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-send-message">Mensaje para este envío</Label>
              <Textarea
                id="manual-send-message"
                value={manualSendMessageTemplate}
                onChange={(event) => setManualSendMessageTemplate(event.target.value)}
                placeholder={defaultReminderMessageTemplate}
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Puedes usar {`{{name}}`}, {`{{debt}}`} y {`{{phone}}`}. Si lo dejas vacío, se usará el mensaje guardado
                del cliente o el predeterminado configurado.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Para "Enviar a 1 persona", primero marca solo 1 cliente en la tabla.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsSendOptionsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isConfirmRemindersOpen} onOpenChange={setIsConfirmRemindersOpen}>
        <AlertDialogContent className="w-[95vw] max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envío de recordatorios</AlertDialogTitle>
            <AlertDialogDescription>
              {sendScope === "all"
                ? "Se enviarán recordatorios a todos los clientes elegibles (deuda, teléfono y recordatorio activo)."
                : selectedCount === 1
                ? "Se enviará un recordatorio al cliente seleccionado si cumple los requisitos."
                : "Se enviarán recordatorios a los clientes seleccionados que cumplan los requisitos."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                Enviar: {sendScope === "all" ? eligibleAllCustomers.length : eligibleSelectedCustomers.length}
              </Badge>
              {sendScope === "selected" && (
                <>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                    Sin teléfono: {skippedNoPhoneCount}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                    Sin deuda: {skippedNoDebtCount}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                    Recordatorios apagados: {skippedDisabledCount}
                  </Badge>
                </>
              )}
            </div>

            <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
              {normalizeReminderTemplate(manualSendMessageTemplate)
                ? "Se usará el mensaje personalizado que escribiste en las opciones de envío."
                : "Se usará el mensaje guardado de cada cliente o el mensaje predeterminado configurado."}
            </div>

            <div className="max-h-[260px] overflow-auto rounded-md border p-2">
              {scopedCustomers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No hay clientes seleccionados.</div>
              ) : (
                <div className="space-y-1">
                  {scopedCustomers.map((customer) => {
                    const eligible = isEligibleForReminder(customer)
                    return (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between gap-4 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{customer.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {customer.phone ? customer.phone : "Sin teléfono"} - Deuda: $
                            {customer.debt.toLocaleString()}
                          </span>
                        </div>
                        {eligible ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => void handleSendSingleReminder(customer)}
                            disabled={
                              isSendingReminders ||
                              (sendingSingleCustomerId !== null && sendingSingleCustomerId !== customer.id)
                            }
                          >
                            {sendingSingleCustomerId === customer.id ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Enviando...
                              </span>
                            ) : (
                              "Enviar"
                            )}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 text-slate-600">
                            Omitir
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSendingReminders}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSendSelectedReminders}
              disabled={isSendingReminders}
            >
              {isSendingReminders ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : (
                "Confirmar envío"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isWhatsappDialogOpen} onOpenChange={setIsWhatsappDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[420px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escanea el QR con WhatsApp para habilitar el envio en tiempo real.
            </DialogDescription>
          </DialogHeader>
          {whatsappBotDisabled && (
            <div className={`rounded-md border px-3 py-2 text-xs ${whatsappAccessTone}`}>
              {whatsappAccessMessage}
            </div>
          )}
          <div className="flex flex-col items-center justify-center gap-4 py-2">
            {!whatsappStatus.ready && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      onClick={handleConnectWhatsapp}
                      disabled={whatsappBotDisabled || isWhatsappConnecting}
                      className="gap-2"
                    >
                      {isWhatsappConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isWhatsappConnecting ? "Conectando..." : "Conectar WhatsApp"}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{whatsappTooltipMessage}</TooltipContent>
              </Tooltip>
            )}
            {whatsappStatus.ready ? (
              <div className="text-sm text-emerald-600 font-medium">WhatsApp conectado.</div>
            ) : whatsappQrDataUrl ? (
              <>
                <img src={whatsappQrDataUrl} alt="QR WhatsApp" className="h-56 w-56 rounded-md border" />
                <div className="text-xs text-muted-foreground">El codigo se actualiza automaticamente.</div>
              </>
            ) : isWhatsappConnecting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando QR...
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Haz clic en Conectar WhatsApp para generar el QR.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar al cliente <span className="font-bold">{customerToDelete?.name}</span>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {customerToDelete && customerToDelete.debt > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600 font-medium">
                Advertencia: Este cliente tiene una deuda pendiente de ${customerToDelete.debt.toLocaleString()}.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsConfirmDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Eliminar Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
