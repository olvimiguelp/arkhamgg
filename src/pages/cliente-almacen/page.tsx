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
import type { Customer, Sale, Payment, CartItem } from "@/components/store-context"
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
import { uploadReportToStorage } from "@/lib/reports-storage"
import { generateSalesReportPDF } from "@/lib/report-pdf-generator"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useSystemConfig } from "@/hooks/use-system-config"
import { useTenantSubscription } from "@/hooks/use-tenant-subscription"
import { useRealtimeTableRefresh } from "@/hooks/use-realtime-table-refresh"
import { getMembershipSelection } from "@/lib/membership"
import { getLocalWebhookUrl, getLocalHealthUrl, getWebhookSecret } from "@/lib/webhook-dns-utils"
import {
  normalizePaymentMethod as normalizeStrictPaymentMethod,
  normalizeRuntimeItemId,
  resolveSaleItemSource,
} from "@/lib/transaction-classification"
import { AlmacenSaleDialog } from "@/components/cliente-almacen/almacen-sale-dialog"
import { printPaymentInvoice } from "@/components/invoice-printer"
import type { SaveClientInvoiceOptions } from "@/lib/invoice-storage"
import {
  allocatePaymentToInvoices,
  formatSaleCreatedDateTime,
  getFirstCreatedPendingSale,
  getSaleCreditPendingAmount,
  sortSalesByRecencyDesc,
  type PaymentAllocation,
} from "@/lib/credit-sale-utils"
import { Pagado } from "@/components/pagado"

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
  // Avoid String.prototype.replaceAll for older TS lib targets (ES2020).
  return template
    .replace(/\\{\\{name\\}\\}/g, customer.name || "Cliente")
    .replace(/\\{\\{debt\\}\\}/g, formatReminderDebt(customer.debt))
    .replace(/\\{\\{phone\\}\\}/g, customer.phone || "")
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

const STATUS_LABELS: Record<Sale["status"], string> = {
  completada: "Completada",
  devuelta_parcial: "Devuelta parcial",
  devuelta_completa: "Devuelta completa",
  anulada: "Anulada",
  credito: "A Crédito",
  pending: "Pendiente",
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

type AlmacenCustomerFormInput = Omit<Customer, "id"> & {
  sourceCustomerId?: string | null
}

const parseAmount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeCustomerStatus = (value: unknown): Customer["status"] => {
  return String(value ?? "").trim().toLowerCase() === "finalizado" ? "Finalizado" : "En proceso"
}

const normalizeSaleStatus = (value: unknown): Sale["status"] => {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "completada") return "completada"
  if (normalized === "devuelta_parcial") return "devuelta_parcial"
  if (normalized === "devuelta_completa") return "devuelta_completa"
  if (normalized === "anulada") return "anulada"
  if (normalized === "pending" || normalized === "pendiente") return "pending"
  return "credito"
}

const normalizePaymentMethod = (value: unknown): Payment["paymentMethod"] => {
  return normalizeStrictPaymentMethod(value)
}

type StoredAlmacenPayment = Payment & {
  creditSaleId?: string | null
  appliedAllocations?: PaymentAllocation[]
}

const isMissingColumnError = (error: unknown, columnName: string) => {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  const normalizedColumn = columnName.trim().toLowerCase()
  return message.includes(normalizedColumn) && (message.includes("column") || message.includes("schema cache"))
}

const normalizeStoredPaymentAllocations = (value: unknown): PaymentAllocation[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null

      const row = item as Record<string, unknown>
      const saleId = String(row.saleId ?? row.sale_id ?? "").trim()
      const invoiceNumber = String(row.invoiceNumber ?? row.invoice_number ?? "").trim()
      const pendingAmount = Math.round(Math.max(0, parseAmount(row.pendingAmount ?? row.pending_amount)) * 100) / 100
      const appliedAmount = Math.round(Math.max(0, parseAmount(row.appliedAmount ?? row.applied_amount)) * 100) / 100
      const remainingAmount = Math.round(Math.max(0, parseAmount(row.remainingAmount ?? row.remaining_amount)) * 100) / 100

      if (!saleId || appliedAmount <= 0) return null

      return {
        saleId,
        invoiceNumber,
        pendingAmount,
        appliedAmount,
        remainingAmount,
      }
    })
    .filter((item): item is PaymentAllocation => item !== null)
}

const mapCartItems = (value: unknown): CartItem[] => {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>
    const resolvedSource = resolveSaleItemSource(row, "armacen") ?? resolveSaleItemSource(row, "products")
    const sellPrice = parseAmount(row.customPrice ?? row.sellPrice ?? row.price)
    const quantity = Math.max(0, parseAmount(row.quantity) || 0)
    return {
      id: normalizeRuntimeItemId(row, resolvedSource?.sourceTable ?? "products") || `item-${index}`,
      sourceTable: resolvedSource?.sourceTable ?? "products",
      sourceId: resolvedSource?.sourceId ?? String(row.id ?? row.productId ?? `item-${index}`),
      sku: String(row.sku ?? ""),
      name: String(row.name ?? row.productName ?? "Producto"),
      category: String(row.category ?? ""),
      boxNumber: row.boxNumber ? String(row.boxNumber) : undefined,
      stock: parseAmount(row.stock),
      minStock: parseAmount(row.minStock),
      buyPrice: parseAmount(row.buyPrice),
      wholesalePrice: parseAmount(row.wholesalePrice ?? row.wholesale_price),
      sellPrice,
      supplier: String(row.supplier ?? ""),
      capacity: row.capacity ? String(row.capacity) : undefined,
      imei: row.imei ? String(row.imei) : undefined,
      cartId: String(row.cartId ?? `${row.id ?? row.productId ?? "item"}-${index}`),
      quantity,
      customPrice: row.customPrice === undefined || row.customPrice === null ? undefined : parseAmount(row.customPrice),
    }
  })
}

const mapAlmacenCustomerRowToCustomer = (row: Record<string, unknown>): Customer => ({
  id: String(row.id ?? ""),
  name: String(row.name ?? "Cliente sin nombre"),
  cedula: String(row.cedula ?? ""),
  phone: String(row.phone ?? ""),
  email: String(row.email ?? ""),
  address: String(row.address ?? ""),
  status: normalizeCustomerStatus(row.status),
  creditDevice: "",
  notes: String(row.notes ?? ""),
  debt: parseAmount(row.debt),
  totalPurchases: parseAmount(row.total_purchases),
  creditBalance: 0,
  creditLimit: parseAmount(row.credit_limit),
  reminderEnabled: false,
  reminderIntervalDays: DEFAULT_REMINDER_INTERVAL_DAYS,
  reminderLastSentAt: null,
  reminderMessage: null,
})

const mapGeneralCustomerRowToCustomer = (row: Record<string, unknown>): Customer => ({
  id: String(row.id ?? ""),
  name: String(row.name ?? "Cliente sin nombre"),
  cedula: String(row.cedula ?? ""),
  phone: String(row.phone ?? ""),
  email: String(row.email ?? ""),
  address: String(row.address ?? ""),
  status: normalizeCustomerStatus(row.status),
  creditDevice: String(row.credit_device ?? row.creditDevice ?? ""),
  notes: String(row.notes ?? ""),
  debt: parseAmount(row.debt),
  totalPurchases: parseAmount(row.total_purchases),
  creditBalance: parseAmount(row.credit_balance),
  creditLimit: parseAmount(row.credit_limit),
  reminderEnabled: Boolean(row.reminder_enabled ?? row.reminderEnabled ?? false),
  reminderIntervalDays: normalizeReminderIntervalDays(
    String(row.reminder_interval_days ?? row.reminderIntervalDays ?? DEFAULT_REMINDER_INTERVAL_DAYS),
  ),
  reminderLastSentAt:
    row.reminder_last_sent_at === undefined || row.reminder_last_sent_at === null
      ? null
      : String(row.reminder_last_sent_at),
  reminderMessage:
    row.reminder_message === undefined || row.reminder_message === null
      ? null
      : String(row.reminder_message),
})

const mapAlmacenCreditSaleRowToSale = (row: Record<string, unknown>): Sale => ({
  id: String(row.sale_id ?? row.id ?? ""),
  invoiceNumber: String(row.invoice_number ?? row.id ?? ""),
  date: String(row.date ?? new Date().toISOString()),
  items: mapCartItems(row.items),
  total: parseAmount(row.total),
  amountPaid: parseAmount(row.amount_paid),
  change: 0,
  paymentMethod: normalizePaymentMethod(row.payment_method ?? "credit"),
  customerName: row.customer_name ? String(row.customer_name) : undefined,
  customerPhone: undefined,
  customerId: row.customer_account_id ? String(row.customer_account_id) : undefined,
  status: normalizeSaleStatus(row.status),
  manualPaidChecked: Boolean(row.manual_paid_checked ?? false),
})

const mapAlmacenPaymentRowToPayment = (row: Record<string, unknown>): StoredAlmacenPayment => ({
  id: String(row.id ?? ""),
  customerId: String(row.customer_account_id ?? ""),
  amount: parseAmount(row.amount),
  date: String(row.date ?? new Date().toISOString()),
  invoiceNumber: String(row.invoice_number ?? row.id ?? ""),
  previousDebt: parseAmount(row.previous_debt),
  remainingDebt: parseAmount(row.remaining_debt),
  paymentMethod: normalizePaymentMethod(row.payment_method),
  paymentKind: "debt_payment",
  note: row.note ? String(row.note) : undefined,
  customerType: "almacen",
  creditSaleId: row.credit_sale_id ? String(row.credit_sale_id) : null,
  appliedAllocations: normalizeStoredPaymentAllocations(row.applied_allocations),
})

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100

const buildAlmacenPaymentInvoiceNumber = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  const seconds = `${date.getSeconds()}`.padStart(2, "0")
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `ALM-PAY-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`
}

export default function CustomersPage() {
  const {
    setOnDialogOpen,
    products,
    employees,
    currentUser,
    isTableMissing,
    deleteSale: deleteStoreSale,
  } = useStore()
  const supabase = useMemo(() => createClient(), [])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [payments, setPayments] = useState<StoredAlmacenPayment[]>([])
  const [generalCustomersForImport, setGeneralCustomersForImport] = useState<Customer[]>([])
  const [selectedGeneralCustomerForImport, setSelectedGeneralCustomerForImport] = useState<string>("none")
  const [isImportingGeneralCustomer, setIsImportingGeneralCustomer] = useState(false)
  const employee = employees.find((e) => e.email === currentUser?.email)
  const isAdmin = currentUser?.role === "admin"
  const currentOwnerAdminId = useMemo(() => {
    const adminId = String(currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || "").trim()
    return adminId || null
  }, [currentUser])
  const tenantAdminId = currentUser?.adminId ?? null
  const { row: tenantSubscription, loading: tenantSubscriptionLoading } =
    useTenantSubscription(tenantAdminId)
  const canAdd = isAdmin || employee?.permissions.canAdd
  const canDelete = isAdmin || employee?.permissions.canDelete
  const canEdit = isAdmin || employee?.permissions.canEdit
  const [searchTerm, setSearchTerm] = useState("")
  const [isAlmacenSaleDialogOpen, setIsAlmacenSaleDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null)

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [customerHistory, setCustomerHistory] = useState<Sale[]>([])
  const [customerPayments, setCustomerPayments] = useState<StoredAlmacenPayment[]>([])

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [recentPaymentReceipt, setRecentPaymentReceipt] = useState<{ payment: StoredAlmacenPayment; customer: Customer } | null>(null)
  const [paymentCustomerId, setPaymentCustomerId] = useState("")
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
    customerId: string
    customerName: string
    previousDebt: number
    amount: number
    note: string
    paymentMethod: "cash" | "card" | "transfer"
    appliedSaleIds: string[]
  } | null>(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentMethodAbono, setPaymentMethodAbono] = useState<"cash" | "card" | "transfer">("cash")
  const [paymentToDelete, setPaymentToDelete] = useState<StoredAlmacenPayment | null>(null)
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

  const loadGeneralCustomersForImport = useCallback(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading customers for import:", error)
      setGeneralCustomersForImport([])
      return
    }

    const mapped = (data || []).map((row) => mapGeneralCustomerRowToCustomer(row as Record<string, unknown>))
    setGeneralCustomersForImport(mapped)
  }, [supabase])

  const loadAlmacenCustomers = useCallback(async () => {
    let query = supabase.from("almacen_customer_accounts").select("*")

    if (currentOwnerAdminId) {
      query = query.eq("owner_admin_id", currentOwnerAdminId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading almacen_customer_accounts:", error)
      setCustomers([])
      return
    }

    const mapped = (data || []).map((row) => mapAlmacenCustomerRowToCustomer(row as Record<string, unknown>))
    setCustomers(mapped)
  }, [currentOwnerAdminId, supabase])

  const loadAlmacenCreditSales = useCallback(async () => {
    let query = supabase.from("almacen_credit_sales").select("*")

    if (currentOwnerAdminId) {
      query = query.eq("owner_admin_id", currentOwnerAdminId)
    }

    const { data, error } = await query.order("date", { ascending: false })

    if (error) {
      console.error("Error loading almacen_credit_sales:", error)
      setSales([])
      return
    }

    const mapped = (data || []).map((row) => mapAlmacenCreditSaleRowToSale(row as Record<string, unknown>))
    setSales(mapped)
  }, [currentOwnerAdminId, supabase])

  const loadAlmacenPayments = useCallback(async () => {
    let query = supabase.from("almacen_payments").select("*")

    if (currentOwnerAdminId) {
      query = query.eq("owner_admin_id", currentOwnerAdminId)
    }

    const { data, error } = await query.order("date", { ascending: false })

    if (error) {
      console.error("Error loading almacen_payments:", error)
      setPayments([])
      return
    }

    const mapped = (data || []).map((row) => mapAlmacenPaymentRowToPayment(row as Record<string, unknown>))
    setPayments(mapped)
  }, [currentOwnerAdminId, supabase])

  const refreshAlmacenData = useCallback(async () => {
    await Promise.all([loadAlmacenCustomers(), loadAlmacenCreditSales(), loadAlmacenPayments()])
  }, [loadAlmacenCreditSales, loadAlmacenCustomers, loadAlmacenPayments])

  useEffect(() => {
    void refreshAlmacenData()
  }, [refreshAlmacenData])

  useRealtimeTableRefresh(
    ["almacen_customer_accounts", "almacen_credit_sales", "almacen_payments"],
    () => {
      void refreshAlmacenData()
    },
    { ownerAdminId: currentUser?.adminId ?? null },
  )

  const addCustomer = useCallback(
    async (data: AlmacenCustomerFormInput) => {
      if (!currentOwnerAdminId) {
        throw new Error("No hay un administrador activo para asociar este cliente del almacén.")
      }

      const payload = {
        owner_admin_id: currentOwnerAdminId,
        source_customer_id: data.sourceCustomerId || null,
        name: (data.name || "").trim() || "Cliente sin nombre",
        cedula: data.cedula?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        notes: data.notes?.trim() || null,
        debt: roundMoney(parseAmount(data.debt)),
        total_purchases: roundMoney(parseAmount(data.totalPurchases)),
        credit_limit: roundMoney(parseAmount(data.creditLimit)),
        status: normalizeCustomerStatus(data.status),
      }

      const { data: inserted, error } = await supabase
        .from("almacen_customer_accounts")
        .insert(payload)
        .select("*")
        .single()

      if (error) {
        console.error("Error inserting almacen customer:", error)
        throw error
      }

      const mapped = mapAlmacenCustomerRowToCustomer(inserted as Record<string, unknown>)
      setCustomers((prev) => [mapped, ...prev.filter((customer) => customer.id !== mapped.id)])
      return mapped.id
    },
    [currentOwnerAdminId, supabase],
  )

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>) => {
      const existing = customers.find((customer) => customer.id === id)
      if (!existing) return

      const merged = { ...existing, ...updates }
      const payload = {
        name: (merged.name || "").trim() || "Cliente sin nombre",
        cedula: merged.cedula?.trim() || null,
        phone: merged.phone?.trim() || null,
        email: merged.email?.trim() || null,
        address: merged.address?.trim() || null,
        notes: merged.notes?.trim() || null,
        debt: roundMoney(parseAmount(merged.debt)),
        total_purchases: roundMoney(parseAmount(merged.totalPurchases)),
        credit_limit: roundMoney(parseAmount(merged.creditLimit)),
        status: normalizeCustomerStatus(merged.status),
      }

      let updateQuery = supabase.from("almacen_customer_accounts").update(payload).eq("id", id)
      if (currentOwnerAdminId) {
        updateQuery = updateQuery.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { error } = await updateQuery

      if (error) {
        console.error("Error updating almacen customer:", error)
        throw error
      }

      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === id
            ? {
                ...customer,
                ...updates,
                status: normalizeCustomerStatus(merged.status),
              }
            : customer,
        ),
      )
    },
    [currentOwnerAdminId, customers, supabase],
  )

  const deleteCustomer = useCallback(
    async (id: string) => {
      let deleteQuery = supabase.from("almacen_customer_accounts").delete().eq("id", id)
      if (currentOwnerAdminId) {
        deleteQuery = deleteQuery.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { error } = await deleteQuery
      if (error) {
        console.error("Error deleting almacen customer:", error)
        throw error
      }

      setCustomers((prev) => prev.filter((customer) => customer.id !== id))
      setSales((prev) => prev.filter((sale) => sale.customerId !== id))
      setPayments((prev) => prev.filter((payment) => payment.customerId !== id))
    },
    [supabase],
  )

  const addPayment = useCallback(
    async (paymentData: {
      customerId: string
      amount: number
      previousDebt: number
      remainingDebt: number
      paymentMethod?: "cash" | "card" | "transfer"
      note?: string
    }, paymentAllocations: PaymentAllocation[] = []) => {
      const customer = customers.find((item) => item.id === paymentData.customerId)
      if (!customer) {
        throw new Error("Cliente no encontrado en almacen_customer_accounts.")
      }

      const amount = roundMoney(parseAmount(paymentData.amount))
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("El monto del abono debe ser mayor que 0.")
      }

      const method = normalizePaymentMethod(paymentData.paymentMethod)
      if (!currentOwnerAdminId) {
        throw new Error("No hay un administrador activo para registrar el abono del almacén.")
      }

      const { data: accountSnapshot, error: accountSnapshotError } = await supabase
        .from("almacen_customer_accounts")
        .select("id, debt")
        .eq("id", customer.id)
        .eq("owner_admin_id", currentOwnerAdminId)
        .maybeSingle()

      if (accountSnapshotError) {
        console.error("Error loading almacen customer debt snapshot:", accountSnapshotError)
        throw accountSnapshotError
      }

      if (!accountSnapshot) {
        throw new Error("No se encontró la cuenta del cliente para aplicar el abono.")
      }

      const previousDebt = roundMoney(parseAmount(accountSnapshot.debt))
      if (amount > previousDebt) {
        throw new Error("El monto del abono no puede ser mayor que la deuda actual.")
      }
      const remainingDebt = roundMoney(Math.max(0, previousDebt - amount))

      const payload = {
        owner_admin_id: currentOwnerAdminId,
        invoice_number: buildAlmacenPaymentInvoiceNumber(),
        customer_account_id: customer.id,
        applied_allocations: paymentAllocations,
        amount,
        previous_debt: previousDebt,
        remaining_debt: remainingDebt,
        payment_method: method,
        date: new Date().toISOString(),
        note: paymentData.note?.trim() || null,
        created_by: currentUser?.id || null,
        created_by_name: currentUser?.name || null,
      }

      let insertPayload: Record<string, unknown> = payload
      let { data: inserted, error } = await supabase
        .from("almacen_payments")
        .insert(insertPayload)
        .select("*")
        .single()

      if (error && isMissingColumnError(error, "applied_allocations")) {
        const fallbackPayload = { ...payload }
        delete fallbackPayload.applied_allocations
        insertPayload = fallbackPayload
        ;({ data: inserted, error } = await supabase.from("almacen_payments").insert(insertPayload).select("*").single())
      }

      if (error) {
        console.error("Error inserting almacen payment:", error)
        throw error
      }

      let accountUpdateQuery = supabase
        .from("almacen_customer_accounts")
        .update({
          debt: remainingDebt,
          status: remainingDebt > 0 ? "En proceso" : "Finalizado",
        })
        .eq("id", customer.id)
      if (currentOwnerAdminId) {
        accountUpdateQuery = accountUpdateQuery.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { error: accountError } = await accountUpdateQuery

      if (accountError) {
        console.error("Error updating almacen customer debt:", accountError)
        throw accountError
      }

      const mapped = mapAlmacenPaymentRowToPayment(inserted as Record<string, unknown>)
      setPayments((prev) => [mapped, ...prev.filter((payment) => payment.id !== mapped.id)])
      setCustomers((prev) =>
        prev.map((item) =>
          item.id === customer.id
            ? { ...item, debt: remainingDebt, status: remainingDebt > 0 ? "En proceso" : "Finalizado" }
            : item,
        ),
      )

      return mapped
    },
    [currentOwnerAdminId, customers, currentUser?.id, currentUser?.name, supabase],
  )

  const deletePayment = useCallback(
    async (paymentId: string) => {
      const payment = payments.find((item) => item.id === paymentId)
      if (!payment) return

      const previousPayments = [...payments]
      const previousCustomers = [...customers]
      const previousSales = [...sales]

      const customer = customers.find((item) => item.id === payment.customerId)
      const restoredDebt = roundMoney(Math.max(0, parseAmount((customer?.debt ?? 0) + payment.amount)))

      const paymentAllocations: PaymentAllocation[] = [...(payment.appliedAllocations ?? [])]
      let paymentDeleted = false
      if (paymentAllocations.length === 0 && payment.creditSaleId) {
        const sale = sales.find((item) => item.id === payment.creditSaleId)
        if (sale) {
          const appliedAmount = roundMoney(Math.min(Number(payment.amount || 0), Number(sale.amountPaid || 0)))
          paymentAllocations.push({
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber || sale.id,
            pendingAmount: getSaleCreditPendingAmount(sale),
            appliedAmount,
            remainingAmount: Math.max(0, getSaleCreditPendingAmount(sale) - appliedAmount),
          })
        }
      }

      if (paymentAllocations.length === 0) {
        const fallbackCandidates = sortSalesByRecencyDesc(
          sales.filter((sale) => {
            const matchesCustomer =
              sale.customerId === payment.customerId ||
              sale.customerName === customer?.name ||
              (!!customer?.phone && sale.customerPhone === customer.phone)
            return matchesCustomer && Number(sale.amountPaid || 0) > 0
          }),
        )

        let remainingToRevert = roundMoney(Number(payment.amount || 0))

        for (const sale of fallbackCandidates) {
          if (remainingToRevert <= 0) break

          const currentAmountPaid = roundMoney(Number(sale.amountPaid || 0))
          const appliedAmount = Math.min(currentAmountPaid, remainingToRevert)
          if (appliedAmount <= 0) continue

          const pendingAmount = getSaleCreditPendingAmount(sale)
          paymentAllocations.push({
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber || sale.id,
            pendingAmount,
            appliedAmount,
            remainingAmount: Math.max(0, pendingAmount - appliedAmount),
          })
          remainingToRevert = roundMoney(remainingToRevert - appliedAmount)
        }
      }

      let paymentDeleteQuery = supabase.from("almacen_payments").delete().eq("id", paymentId)
      if (currentOwnerAdminId) {
        paymentDeleteQuery = paymentDeleteQuery.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { error: paymentError } = await paymentDeleteQuery
      if (paymentError) {
        console.error("Error deleting almacen payment:", paymentError)
        throw paymentError
      }
      paymentDeleted = true

      try {
        for (const allocation of paymentAllocations) {
          const sale = sales.find((item) => item.id === allocation.saleId)
          if (!sale) continue

          const currentAmountPaid = roundMoney(Number(sale.amountPaid || 0))
          const nextAmountPaid = roundMoney(Math.max(0, currentAmountPaid - Math.max(0, allocation.appliedAmount)))
          const nextPending = roundMoney(Math.max(0, Number(sale.total || 0) - nextAmountPaid))
          const nextStatus = nextPending <= 0 ? "completada" : "credito"

          const { error: salesUpdateError } = await supabase
            .from("sales")
            .update({
              amount_paid: nextAmountPaid,
              status: nextStatus,
              credit_resolved: nextPending <= 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sale.id)

          if (salesUpdateError) throw salesUpdateError

          const { error: creditUpdateError } = await supabase
            .from("almacen_credit_sales")
            .update({ amount_paid: nextAmountPaid, status: nextStatus })
            .eq("sale_id", sale.id)

          if (creditUpdateError) throw creditUpdateError

          setSales((prev) =>
            prev.map((item) =>
              item.id === sale.id
                ? { ...item, amountPaid: nextAmountPaid, status: nextStatus, creditResolved: nextPending <= 0 }
                : item,
            ),
          )
        }

        if (customer) {
          let accountRestoreQuery = supabase
            .from("almacen_customer_accounts")
            .update({
              debt: restoredDebt,
              status: restoredDebt > 0 ? "En proceso" : "Finalizado",
            })
            .eq("id", customer.id)
          if (currentOwnerAdminId) {
            accountRestoreQuery = accountRestoreQuery.eq("owner_admin_id", currentOwnerAdminId)
          }

          const { error: accountError } = await accountRestoreQuery

          if (accountError) {
            console.error("Error restoring almacen customer debt:", accountError)
            throw accountError
          }

          setCustomers((prev) =>
            prev.map((item) =>
              item.id === customer.id
                ? { ...item, debt: restoredDebt, status: restoredDebt > 0 ? "En proceso" : "Finalizado" }
                : item,
            ),
          )
        }

        setPayments((prev) => prev.filter((item) => item.id !== paymentId))
        setCustomerPayments((prev) => prev.filter((item) => item.id !== paymentId))
      } catch (error) {
        console.error("Error deleting almacen payment:", error)
        if (paymentDeleted) {
          void refreshAlmacenData()
        } else {
          setPayments(previousPayments)
          setCustomers(previousCustomers)
          setSales(previousSales)
        }
        throw error
      }
    },
    [currentOwnerAdminId, customers, payments, refreshAlmacenData, sales, supabase, setCustomerPayments],
  )

  const deleteSale = useCallback(
    async (saleId: string) => {
      const currentSale = sales.find((sale) => sale.id === saleId)
      const customerAccountId = currentSale?.customerId ?? null
      const creditAmount = currentSale ? roundMoney(Math.max(0, currentSale.total - currentSale.amountPaid)) : 0

      await deleteStoreSale(saleId)

      const { error: saleDeleteError } = await supabase.from("sales").delete().eq("id", saleId)
      if (saleDeleteError) {
        console.error("Error deleting sale record:", saleDeleteError)
      }

      const { error: creditDeleteError } = await supabase.from("almacen_credit_sales").delete().eq("sale_id", saleId)
      if (creditDeleteError) {
        console.error("Error deleting almacen credit sale:", creditDeleteError)
      }

      if (customerAccountId && creditAmount > 0) {
        const account = customers.find((customer) => customer.id === customerAccountId)
        if (account) {
          const updatedDebt = roundMoney(Math.max(0, parseAmount(account.debt) - creditAmount))
          let accountRestoreQuery = supabase
            .from("almacen_customer_accounts")
            .update({
              debt: updatedDebt,
              status: updatedDebt > 0 ? "En proceso" : "Finalizado",
            })
            .eq("id", customerAccountId)

          if (currentOwnerAdminId) {
            accountRestoreQuery = accountRestoreQuery.eq("owner_admin_id", currentOwnerAdminId)
          }

          const { error: accountError } = await accountRestoreQuery

          if (accountError) {
            console.error("Error updating account after deleting credit sale:", accountError)
            throw accountError
          }

          setCustomers((prev) =>
            prev.map((customer) =>
              customer.id === customerAccountId
                ? { ...customer, debt: updatedDebt, status: updatedDebt > 0 ? "En proceso" : "Finalizado" }
                : customer,
            ),
          )
        }
      }
      setSales((prev) => prev.filter((sale) => sale.id !== saleId))
    },
    [customers, currentOwnerAdminId, deleteStoreSale, sales, supabase],
  )

  const handleOpenAddDialog = useCallback(() => {
    if (!canAdd) {
      toast.error("No tienes permisos para agregar clientes en almacén.")
      return
    }
    setIsAddDialogOpen(true)
    setSelectedGeneralCustomerForImport("none")
    setReminderEnabled(false)
    setReminderIntervalDays(DEFAULT_REMINDER_INTERVAL_DAYS)
    setReminderMessage("")
    void loadGeneralCustomersForImport()
  }, [canAdd, loadGeneralCustomersForImport])

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
    const handleOpenAlmacenPayment = () => {
      const withDebt = customers.find((customer) => (customer.debt || 0) > 0)
      if (!withDebt) {
        toast.error("No hay clientes de almacén con deuda para registrar abonos.")
        return
      }

      setPaymentCustomerId(withDebt.id)
      setSelectedPaymentSaleIds([])
      setPaymentAmountDraft("")
      setPaymentMethodAbono("cash")
      setIsPaymentDialogOpen(true)
    }

    window.addEventListener("open-almacen-payment-dialog", handleOpenAlmacenPayment)
    return () => window.removeEventListener("open-almacen-payment-dialog", handleOpenAlmacenPayment)
  }, [customers])

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
        console.debug("[whatsapp] local webhook not configured; skipping health poll")
        setWhatsappStatus({ ready: false, qr: null })
        return undefined
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
    (customer: Customer) =>
      sales.filter(
        (sale) =>
          sale.customerName === customer.name ||
          (sale.customerPhone && sale.customerPhone === customer.phone) ||
          (sale.customerId && sale.customerId === customer.id),
      ),
    [sales],
  )

  const getCustomerPayments = useCallback(
    (customerId: string) => payments.filter((payment) => payment.customerId === customerId),
    [payments],
  )

  useEffect(() => {
    if (!isHistoryDialogOpen || !currentCustomer) return

    const activeCustomer = customers.find((customer) => customer.id === currentCustomer.id) ?? currentCustomer
    const nextHistory = getCustomerSalesHistory(activeCustomer)
    setCustomerHistory(nextHistory)
    setCustomerPayments(getCustomerPayments(activeCustomer.id))


    if (activeCustomer !== currentCustomer) {
      setCurrentCustomer(activeCustomer)
    }
  }, [customers, currentCustomer, getCustomerPayments, getCustomerSalesHistory, isHistoryDialogOpen])

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

  const customersWithDebt = useMemo(
    () => customers.filter((customer) => (customer.debt || 0) > 0),
    [customers],
  )
  const paymentCustomer = useMemo(
    () => customers.find((customer) => customer.id === paymentCustomerId) ?? null,
    [customers, paymentCustomerId],
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

  const handleImportGeneralCustomer = async () => {
    if (!canAdd) {
      toast.error("No tienes permisos para agregar clientes en almacén.")
      return
    }

    if (selectedGeneralCustomerForImport === "none") {
      toast.error("Selecciona un cliente de /clientes para importar.")
      return
    }

    const sourceCustomer = generalCustomersForImport.find(
      (customer) => customer.id === selectedGeneralCustomerForImport,
    )

    if (!sourceCustomer) {
      toast.error("No se encontro el cliente seleccionado.")
      return
    }

    setIsImportingGeneralCustomer(true)
    try {
      const { data: existingBySource, error: existingError } = await supabase
        .from("almacen_customer_accounts")
        .select("id, name")
        .eq("source_customer_id", sourceCustomer.id)
        .maybeSingle()

      if (existingError) {
        console.error("Error checking existing imported customer:", existingError)
      }

      if (existingBySource?.id) {
        toast.info(`El cliente ya existe en Cliente Almacen: ${existingBySource.name}`)
        setIsAddDialogOpen(false)
        setSelectedGeneralCustomerForImport("none")
        return
      }

      await addCustomer({
        name: sourceCustomer.name,
        cedula: sourceCustomer.cedula || "",
        phone: sourceCustomer.phone || "",
        email: sourceCustomer.email || "",
        address: sourceCustomer.address || "",
        notes: sourceCustomer.notes || "",
        debt: 0,
        totalPurchases: 0,
        creditLimit: sourceCustomer.creditLimit || 0,
        creditBalance: 0,
        creditDevice: sourceCustomer.creditDevice || "",
        status: sourceCustomer.status || "En proceso",
        reminderEnabled: sourceCustomer.reminderEnabled ?? false,
        reminderIntervalDays:
          normalizeReminderIntervalDays(sourceCustomer.reminderIntervalDays) ?? DEFAULT_REMINDER_INTERVAL_DAYS,
        reminderMessage: sourceCustomer.reminderMessage ?? null,
        sourceCustomerId: sourceCustomer.id,
      })

      setIsAddDialogOpen(false)
      setSelectedGeneralCustomerForImport("none")
      toast.success("Cliente importado a Cliente Almacen correctamente.")
    } catch (error: any) {
      console.error("Error importing customer from /clientes:", error)
      toast.error(error?.message || "No se pudo importar el cliente.")
    } finally {
      setIsImportingGeneralCustomer(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = (formData.get("name") as string) || "Cliente sin nombre"
    const cedula = (formData.get("cedula") as string) || null
    const normalizedReminderMessage = reminderMessage.trim()
    const normalizedReminderIntervalDays = normalizeReminderIntervalDays(reminderIntervalDays)

    const customerData = {
      name,
      cedula: cedula || "",
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
      sourceCustomerId:
        selectedGeneralCustomerForImport !== "none" ? selectedGeneralCustomerForImport : undefined,
    }

    try {
      if (currentCustomer) {
        await updateCustomer(currentCustomer.id, customerData)
        setIsEditDialogOpen(false)
      } else {
        if (!canAdd) {
          toast.error("No tienes permisos para agregar clientes en almacén.")
          return
        }
        await addCustomer(customerData)
        setIsAddDialogOpen(false)
      }
    } catch (error: any) {
      console.error("Error saving almacen customer:", error)
      toast.error(error?.message || "No se pudo guardar el cliente de almacen.")
      return
    }

    setCurrentCustomer(null)
    setSelectedCreditDevice("")
    setReminderMessage("")
    setSelectedGeneralCustomerForImport("none")
  }

  const handlePaymentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!paymentCustomer) {
      toast.error("Seleccione un cliente con deuda para registrar el abono.")
      return
    }

    const formData = new FormData(e.currentTarget)
    const amount = roundMoney(parseAmount(formData.get("amount")))
    const note = formData.get("note") as string

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingrese un monto válido mayor a 0.")
      return
    }
    if (amount > paymentCustomer.debt) {
      alert("El monto no puede ser mayor a la deuda actual")
      return
    }

    const isSaleForPaymentCustomer = (sale: Sale) =>
      sale.customerId === paymentCustomer.id ||
      (sale.customerPhone && sale.customerPhone === paymentCustomer.phone) ||
      sale.customerName === paymentCustomer.name

    const appliedSaleIds = [...selectedPaymentSaleIds]

    setPendingPayment({
      customerId: paymentCustomer.id,
      customerName: paymentCustomer.name,
      previousDebt: paymentCustomer.debt,
      amount,
      note,
      paymentMethod: paymentMethodAbono,
      appliedSaleIds,
    })
    setIsConfirmPaymentDialogOpen(true)
  }

  const handleConfirmPayment = async () => {
    if (!pendingPayment) return

    const customerForReceipt: Customer = customers.find((item) => item.id === pendingPayment.customerId) ?? {
      id: pendingPayment.customerId,
      name: pendingPayment.customerName,
      cedula: "",
      phone: "",
      email: "",
      address: "",
      status: "En proceso",
      creditDevice: "",
      notes: "",
      debt: pendingPayment.previousDebt,
      totalPurchases: 0,
      creditBalance: 0,
      creditLimit: 0,
    }
    const data = {
      customerId: pendingPayment.customerId,
      amount: pendingPayment.amount,
      previousDebt: pendingPayment.previousDebt,
      remainingDebt: Math.max(0, pendingPayment.previousDebt - pendingPayment.amount),
      paymentMethod: pendingPayment.paymentMethod,
      note: pendingPayment.note,
    }
    const customerName = pendingPayment.customerName
    const isSaleForPaymentCustomer = (sale: Sale) =>
      sale.customerId === customerForReceipt.id ||
      (customerForReceipt.phone && sale.customerPhone === customerForReceipt.phone) ||
      sale.customerName === customerForReceipt.name
    const allCustomerSales = sales.filter(isSaleForPaymentCustomer)
    const paymentAllocationsPreview = allocatePaymentToInvoices(
      allCustomerSales,
      pendingPayment.amount,
      pendingPayment.appliedSaleIds,
    )

    setIsConfirmPaymentDialogOpen(false)
    setIsPaymentDialogOpen(false)
    setPendingPayment(null)
    setPaymentCustomerId("")
    setPaymentMethodAbono("cash")
    setPaymentAmountDraft("")

    setIsProcessingPayment(true)
    try {
      const savedPayment = await addPayment(data, paymentAllocationsPreview)

      if (paymentAllocationsPreview.length > 0) {
        const paidInvoices: string[] = []

        for (const allocation of paymentAllocationsPreview) {
          const sale = allCustomerSales.find((item) => item.id === allocation.saleId)
          if (!sale) continue

          const nextAmountPaid = roundMoney(Number(sale.amountPaid || 0) + allocation.appliedAmount)
          const nextPending = roundMoney(Math.max(0, Number(sale.total || 0) - nextAmountPaid))
          const nextStatus: Sale["status"] = nextPending <= 0 ? "completada" : "credito"
          const normalizedInvoiceNumber = String(sale.invoiceNumber || "").trim()

          const { error: salesUpdateError } = await supabase
            .from("sales")
            .update({
              amount_paid: nextAmountPaid,
              status: nextStatus,
              credit_resolved: nextPending <= 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sale.id)
          if (salesUpdateError) throw salesUpdateError

          const { error: creditUpdateError } = await supabase
            .from("almacen_credit_sales")
            .update({ amount_paid: nextAmountPaid, status: nextStatus })
            .or(
              normalizedInvoiceNumber
                ? `sale_id.eq.${sale.id},id.eq.${sale.id},invoice_number.eq.${normalizedInvoiceNumber}`
                : `sale_id.eq.${sale.id},id.eq.${sale.id}`,
            )
          if (creditUpdateError) throw creditUpdateError

          setSales((prev) =>
            prev.map((entry) =>
              entry.id === sale.id
                ? {
                    ...entry,
                    amountPaid: nextAmountPaid,
                    status: nextStatus,
                    creditResolved: nextPending <= 0,
                  }
                : entry,
            ),
          )

          if (nextPending <= 0) {
            paidInvoices.push(sale.invoiceNumber || sale.id)
          }
        }

          // Persist payment allocations for future reversions
          try {
            // Only persist allocations into `payment_allocations` if the saved payment
            // belongs to the main `payments` table. For almacen payments we store
            // records in `almacen_payments` and inserting allocations would violate
            // the FK constraint pointing to `payments`.
            if (savedPayment?.customerType !== "almacen") {
              const allocationRows = paymentAllocationsPreview.map((allocation) => ({
                id: crypto.randomUUID(),
                payment_id: savedPayment.id,
                sale_id: allocation.saleId,
                invoice_number: allocation.invoiceNumber || null,
                applied_amount: allocation.appliedAmount,
                pending_before: allocation.pendingAmount,
                pending_after: allocation.remainingAmount,
                owner_admin_id: currentOwnerAdminId,
              }))

              const { error: allocInsertError } = await supabase.from("payment_allocations").insert(allocationRows)
              if (allocInsertError) {
                console.error("Error inserting payment allocations:", allocInsertError)
              }
            } else {
              console.debug("Skipping payment_allocations insert for almacen payment id=", savedPayment?.id)
            }
          } catch (err) {
            console.error("Exception inserting payment allocations:", err)
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

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return
    try {
      await deleteCustomer(customerToDelete.id)
      setIsConfirmDeleteDialogOpen(false)
      setCustomerToDelete(null)
    } catch (err: any) {
      console.error("Error deleting almacen customer:", err)
      toast.error(err?.message || "No se pudo eliminar el cliente.")
    }
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
        start: new Date(0),
        end: new Date(8640000000000000),
      }
    }

    if (reportPeriod === "year") {
      const year = Number(reportYear)
      if (!Number.isInteger(year) || year < 1900 || year > 9999) return null
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

  const generateReport = async (format: "pdf" | "excel", action: "download" | "upload", reportType: "customer" | "all" = "customer") => {
    if (reportType === "customer" && !currentCustomer) return

    setIsGeneratingReport(true)
    try {
      const periodRange = getCustomReportRange()
      if (!periodRange) {
        toast.error("Seleccione un periodo válido para generar el reporte")
        return
      }
      
      let history: Sale[] = []
      let reportTitle = ""
      let fileName = ""

      if (reportType === "all") {
        // Reporte de TODAS las ventas
        history = sales.filter((s) => {
          const saleDate = new Date(s.date)
          if (Number.isNaN(saleDate.getTime())) return false
          return saleDate >= periodRange.start && saleDate <= periodRange.end
        })
        const periodLabel = getCurrentPeriodLabel()
        reportTitle = `Reporte de Todas las Ventas - ${periodLabel}`
        const periodSlug = reportPeriod === "month" ? "mes" : reportPeriod
        fileName = `Reporte-Total-${periodSlug}-${Date.now()}`
      } else {
        // Reporte de cliente específico
        history = sales.filter((s) => {
          const saleDate = new Date(s.date)
          if (Number.isNaN(saleDate.getTime())) return false
          if (saleDate < periodRange.start || saleDate > periodRange.end) return false

          const isCustomerMatch =
            s.customerName === currentCustomer!.name ||
            (s.customerPhone && s.customerPhone === currentCustomer!.phone) ||
            (s.customerId && s.customerId === currentCustomer!.id)

          // Igual que en /clientes: reporte individual solo incluye compras a credito.
          return isCustomerMatch && s.status === "credito"
        })
        reportTitle = `Reporte de Compras a Crédito - ${currentCustomer!.name}`
        const periodSlug = reportPeriod === "month" ? "mes" : reportPeriod
        fileName = `Reporte-Credito-${periodSlug}-${currentCustomer!.name.replace(/\s+/g, "_")}-${Date.now()}`
      }

      if (history.length === 0) {
        toast.error(reportType === "customer" ? "No hay compras a crédito para generar el reporte" : "No hay ventas para generar el reporte")
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
                  id: "fallback",
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
              total: Math.round((quantity * unitPrice) * 100) / 100,
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

      if (format === "pdf") {
        const pdfBlob = await generateSalesReportPDF(reportRows, {
          customerName: reportType === "customer" ? currentCustomer?.name : undefined,
          periodLabel,
          reportTitle,
        }, formatCurrency)

        if (action === "download") {
          // Descargar PDF
          const url = URL.createObjectURL(pdfBlob)
          const link = document.createElement("a")
          link.href = url
          link.download = `${fileName}.pdf`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          toast.success("PDF descargado exitosamente")
        } else {
          const result = await uploadReportToStorage(pdfBlob, `${fileName}.pdf`, "pdf")
          if (result.success) toast.success("Reporte guardado en la nube")
          else {
            console.error("Error Storage:", result.error)
            toast.error(`Error al guardar: ${result.error || "Desconocido"}`)
          }
        }
      } else {
        const { utils, writeFile, write } = await import("xlsx")
        const data = reportRows.map((row) => ({
          Factura: row.invoice,
          Fecha: row.date.toLocaleDateString(),
          Producto: row.product,
          Cantidad: row.quantity,
          Precio: row.price,
          Total: row.total,
          Estado: STATUS_LABELS[row.status] ?? row.status,
        }))

        const ws = utils.json_to_sheet(data)
        const wb = utils.book_new()
        utils.book_append_sheet(wb, ws, "Ventas")

        if (action === "download") {
          writeFile(wb, `${fileName}.xlsx`)
          toast.success("Excel descargado exitosamente")
        } else {
          const excelBuffer = write(wb, { bookType: "xlsx", type: "array" })
          const excelBlob = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          })
          const result = await uploadReportToStorage(excelBlob, `${fileName}.xlsx`, "excel")
          if (result.success) toast.success("Reporte guardado en la nube")
          else {
            console.error("Error Storage:", result.error)
            toast.error(`Error al guardar: ${result.error || "Desconocido"}`)
          }
        }
      }
    } catch (err: any) {
      console.error("Report Generation Error:", err)
      toast.error(`Error al generar el reporte: ${err.message || "Error fatal"}`)
    } finally {
      setIsGeneratingReport(false)
    }
  }
  const getPendingCreditAmount = getSaleCreditPendingAmount

  const paymentDraftAmountValue = useMemo(() => {
    const parsed = Number(paymentAmountDraft)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
  }, [paymentAmountDraft])
  const paymentCustomerPendingCreditSales = useMemo(
    () =>
      sortSalesByRecencyDesc(
        sales.filter(
          (sale) =>
            (sale.customerId === paymentCustomer?.id ||
              (paymentCustomer?.phone && sale.customerPhone === paymentCustomer.phone) ||
              sale.customerName === paymentCustomer?.name) &&
            getSaleCreditPendingAmount(sale) > 0,
        ),
      ),
    [paymentCustomer?.id, paymentCustomer?.name, paymentCustomer?.phone, sales],
  )
  const selectedInvoicesPendingTotal = useMemo(
    () =>
      paymentCustomerPendingCreditSales
        .filter((sale) => selectedPaymentSaleIds.includes(sale.id))
        .reduce((acc, sale) => acc + getPendingCreditAmount(sale), 0),
    [paymentCustomerPendingCreditSales, selectedPaymentSaleIds],
  )
  const pendingDebtToConfirm = useMemo(
    () => paymentCustomerPendingCreditSales.reduce((acc, sale) => acc + getPendingCreditAmount(sale), 0),
    [paymentCustomerPendingCreditSales],
  )
  const projectedRemainingDebtAfterPayment = useMemo(
    () => Math.max(0, Number(paymentCustomer?.debt || 0) - paymentDraftAmountValue),
    [paymentCustomer?.debt, paymentDraftAmountValue],
  )
  const oldestInvoicePending = useMemo(() => {
    const oldest = getFirstCreatedPendingSale(paymentCustomerPendingCreditSales)
    return oldest ? getPendingCreditAmount(oldest) : 0
  }, [paymentCustomerPendingCreditSales])
  const projectedSelectedInvoicesPendingAfterPayment = useMemo(() => {
    const basePending = selectedPaymentSaleIds.length > 0 ? selectedInvoicesPendingTotal : oldestInvoicePending
    return Math.max(0, basePending - paymentDraftAmountValue)
  }, [paymentDraftAmountValue, oldestInvoicePending, selectedInvoicesPendingTotal, selectedPaymentSaleIds.length])



  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-hidden px-2 pb-4 pt-2 sm:gap-6 sm:px-4 sm:pb-6 sm:pt-4 lg:gap-6 lg:p-6">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
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
          <Badge variant="outline" className={`w-full justify-center sm:w-auto ${whatsappStatus.ready ? "border-emerald-200 text-emerald-700" : ""}`}>
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
            <span className="text-center text-xs text-muted-foreground sm:text-left">
              Seleccionados: {selectedCount}. Puedes usar la opción "Enviar a 1".
            </span>
          )}
          {whatsappBotDisabled && (
            <span className={`w-full text-center text-xs sm:text-left ${whatsappAccessTone}`}>{whatsappAccessMessage}</span>
          )}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="overflow-hidden rounded-lg border p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold break-words">{customer.name}</div>
                <div className="text-xs text-muted-foreground">ID: {customer.cedula || "-"}</div>
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
                  {customer.reminderEnabled ? getReminderFrequencyLabel(customer.reminderIntervalDays) : "Desactivado"}
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
                  <DropdownMenuItem onClick={() => { setPaymentCustomerId(customer.id); setSelectedPaymentSaleIds([]); setPaymentAmountDraft(""); setPaymentMethodAbono("cash"); setIsPaymentDialogOpen(true) }} className="cursor-pointer">
                    <Wallet className="mr-2 h-4 w-4" />
                    Abonar
                  </DropdownMenuItem>
                  {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canEdit) && (
                    <DropdownMenuItem onClick={() => { setCurrentCustomer(customer); setIsEditDialogOpen(true) }} className="cursor-pointer">
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="cursor-pointer" onClick={() => { setCurrentCustomer(customer); setCustomerHistory(getCustomerSalesHistory(customer)); setCustomerPayments(getCustomerPayments(customer.id)); setIsHistoryDialogOpen(true); setShowOnlyCredit(false) }}>
                    <History className="mr-2 h-4 w-4" />
                    Ver Historial
                  </DropdownMenuItem>
                  {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canDelete) && (
                    <DropdownMenuItem onClick={() => { setCustomerToDelete(customer); setIsConfirmDeleteDialogOpen(true) }} className="text-red-500 cursor-pointer">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden rounded-md border md:block">
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
                          onClick={() => {
                            setPaymentCustomerId(customer.id)
                            setSelectedPaymentSaleIds([])
                            setPaymentAmountDraft("")
                            setPaymentMethodAbono("cash")
                            setIsPaymentDialogOpen(true)
                          }}
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
                            setCurrentCustomer(customer)
                            setCustomerHistory(getCustomerSalesHistory(customer))
                            setCustomerPayments(getCustomerPayments(customer.id))
                            setIsHistoryDialogOpen(true)
                            setShowOnlyCredit(false) // Reset filter when opening
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
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Modifique los datos del cliente seleccionado.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <PopoverContent className="w-[250px] p-0">
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
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Historial - {currentCustomer?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={showOnlyCredit ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyCredit(!showOnlyCredit)}
                >
                  {showOnlyCredit ? "Mostrando Créditos" : "Todas las Ventas"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={reportPeriod} onValueChange={(value: string) => setReportPeriod(value as ReportPeriod)}>
                  <SelectTrigger className="w-[210px] h-8">
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
                    min={1900}
                    max={9999}
                    value={reportYear}
                    onChange={(event) => setReportYear(event.target.value)}
                    className="h-8 w-[120px]"
                    placeholder="Año"
                  />
                )}
                {reportPeriod === "month" && (
                  <Input
                    type="month"
                    value={reportMonth}
                    onChange={(event) => setReportMonth(event.target.value)}
                    className="h-8 w-[160px]"
                  />
                )}
                {reportPeriod === "day" && (
                  <Input
                    type="date"
                    value={reportDay}
                    onChange={(event) => setReportDay(event.target.value)}
                    className="h-8 w-[170px]"
                  />
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => generateReport("pdf", "download")}
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

              <TabsContent value="sales" className="max-h-[60vh] overflow-auto">
                {/* Deuda pendiente removed by request */}
                {customerHistory.filter(s => !showOnlyCredit || s.status === "credito").length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay compras {showOnlyCredit ? "a crédito " : ""}registradas para este cliente.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Factura</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total Venta</TableHead>
                        <TableHead className="min-w-[140px]">Pagado</TableHead>
                        <TableHead>Pendiente</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerHistory
                        .filter(s => !showOnlyCredit || s.status === "credito")
                        .map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{sale.invoiceNumber || sale.id}</TableCell>
                            <TableCell>{sale.items.length} productos</TableCell>
                            <TableCell>${sale.total.toLocaleString()}</TableCell>
                            <TableCell>
                              <Pagado sale={sale} />
                            </TableCell>
                            <TableCell
                              className={
                                getPendingCreditAmount(sale) > 0
                                  ? "font-medium text-red-600"
                                  : ""
                              }
                            >
                              {getPendingCreditAmount(sale) > 0
                                ? `$${getPendingCreditAmount(sale).toLocaleString()}`
                                : sale.paymentMethod === "credit"
                                  ? "Pagada"
                                  : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver productos de esta factura"
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
                                      if (!window.confirm(`¿Eliminar la factura ${sale.invoiceNumber}?`)) return
                                      try {
                                        await deleteSale(sale.id)
                                        setCustomerHistory((prev) => prev.filter((entry) => entry.id !== sale.id))
                                        toast.success(`Factura ${sale.invoiceNumber} eliminada.`)
                                      } catch (error: any) {
                                        console.error("Error deleting almacen credit sale:", error)
                                        toast.error(error?.message || "No se pudo eliminar la factura.")
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
                )}
              </TabsContent>

              <TabsContent value="payments" className="max-h-[60vh] overflow-auto">
                {customerPayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay pagos registrados para este cliente.
                  </div>
                ) : (
                  <>
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
                        {customerPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                            <TableCell>{payment.invoiceNumber}</TableCell>
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
                        ))}
                      </TableBody>
                    </Table>
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
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Productos de Factura - ID: {selectedSaleDetail?.invoiceNumber || selectedSaleDetail?.id}</DialogTitle>
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
          setPaymentCustomerId("")
          setSelectedPaymentSaleIds([])
          setPaymentAmountDraft("")
        }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Registrar Abono</DialogTitle>
            <DialogDescription>
              Cliente: {paymentCustomer?.name || "Seleccione un cliente"} <br />
              Deuda Actual:{" "}
              <span className="font-bold text-red-500">${(paymentCustomer?.debt || 0).toLocaleString()}</span>
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
              <Label>Cliente</Label>
              <Select value={paymentCustomerId} onValueChange={setPaymentCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione cliente con deuda" />
                </SelectTrigger>
                <SelectContent>
                  {customersWithDebt.length > 0 ? (
                    customersWithDebt.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} (Deuda: ${customer.debt.toLocaleString()})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No hay clientes con deuda
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Monto a Abonar</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="1"
                max={paymentCustomer?.debt}
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
                {paymentCustomerPendingCreditSales.map((sale) => (
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
                {paymentCustomerPendingCreditSales.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay facturas pendientes a crédito.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                La lista muestra la más nueva primero. Sin seleccionar, el abono se aplica FIFO (primero la más antigua).
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={!paymentCustomer}>
                Registrar Pago
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recentPaymentReceipt} onOpenChange={(open) => !open && setRecentPaymentReceipt(null)}>
        <DialogContent className="sm:max-w-[420px]">
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
            setSelectedGeneralCustomerForImport("none")
            setReminderEnabled(false)
            setReminderIntervalDays(DEFAULT_REMINDER_INTERVAL_DAYS)
            setReminderMessage("")
            setIsReminderDialogOpen(false)
          }
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
            <DialogDescription>Complete los datos del nuevo cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
            <div className="rounded-md border p-3 space-y-3">
              <div className="space-y-1">
                <Label>Importar desde /clientes (opcional)</Label>
                <p className="text-xs text-muted-foreground">
                  Si el cliente ya existe en la tabla general, puedes importarlo y guardar su `source_customer_id`.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  value={selectedGeneralCustomerForImport}
                  onValueChange={setSelectedGeneralCustomerForImport}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un cliente general" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40vh]">
                    <SelectItem value="none">Seleccionar cliente</SelectItem>
                    {generalCustomersForImport.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.phone ? `(${customer.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleImportGeneralCustomer()}
                  disabled={!canAdd || selectedGeneralCustomerForImport === "none" || isImportingGeneralCustomer}
                  className="w-full sm:w-auto"
                >
                  {isImportingGeneralCustomer ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    "Importar cliente"
                  )}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <PopoverContent className="w-[250px] p-0">
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
            <div className="rounded-md border p-3 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
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
                className="w-full sm:w-auto"
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
        <DialogContent className="sm:max-w-[620px]">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmar Pago</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea registrar un pago de <span className="font-bold text-green-600">${pendingPayment?.amount.toLocaleString()}</span> para el cliente <span className="font-bold">{pendingPayment?.customerName}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Deuda Actual:</span>
              <span>${pendingPayment?.previousDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Monto a Pagar:</span>
              <span className="text-green-600">-${pendingPayment?.amount.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Deuda Restante:</span>
              <span className="text-red-500">${Math.max(0, (pendingPayment?.previousDebt || 0) - (pendingPayment?.amount || 0)).toLocaleString()}</span>
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
        <AlertDialogContent className="sm:max-w-[420px]">
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
        <DialogContent className="sm:max-w-[520px]">
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
        <AlertDialogContent className="sm:max-w-[600px]">
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
        <DialogContent className="sm:max-w-[420px]">
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
        <DialogContent className="sm:max-w-[400px]">
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

      <AlmacenSaleDialog
        open={isAlmacenSaleDialogOpen}
        onOpenChange={(open) => {
          setIsAlmacenSaleDialogOpen(open)
          if (!open) {
            void refreshAlmacenData()
          }
        }}
      />
    </div>
  )
}
