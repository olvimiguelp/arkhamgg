"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import { deleteInvoiceFromStorage } from "@/lib/invoice-storage"
import { getTenantBranding } from "@/lib/tenant-branding"
import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"
import {
  buildSourceRuntimeId,
  type InventorySourceTable,
  isAlmacenSourceRecord,
  looksLikeManualItem,
  normalizeInventorySourceTable,
  normalizePaymentMethod,
  normalizePaymentRecordKind,
  normalizeRuntimeItemId,
  parseSourceRuntimeId,
  resolveSaleItemSource,
  sameSaleItemSource,
  type PaymentMethod,
  type PaymentRecordKind,
  type SaleItemSource,
} from "@/lib/transaction-classification"
import { createClient } from "@/lib/supabase/client"
import {
  isNetworkError,
  isAuthError,
  isRLSError,
  getSupabaseErrorMessage,
  retryAsync,
} from "@/lib/supabase-connection-utils"
import { useToast } from "@/hooks/use-toast"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { broadcastRealtimeTableChange } from "@/hooks/use-realtime-table-refresh"
import type { RepairPhoto } from "@/lib/repair-photo-storage"

export interface Product {
  id: string
  sourceTable?: InventorySourceTable
  sourceId?: string
  sku: string
  name: string
  category: string
  imageUrl?: string
  boxNumber?: string
  stock: number
  minStock: number
  buyPrice: number
  wholesalePrice: number
  sellPrice: number
  supplier: string
  capacity?: string
  imei?: string
}

export interface CartItem extends Omit<Product, "sourceTable"> {
  cartId: string
  sourceTable: SaleItemSource
  sourceId: string
  quantity: number
  customPrice?: number
  dbId?: string // ID from database for manual items
  accountingVersion?: 2
}

export interface Sale {
  id: string
  invoiceNumber: string
  date: string
  createdAt?: string
  items: CartItem[]
  total: number
  amountPaid: number
  change: number
  paymentMethod: PaymentMethod
  customerName?: string
  customerPhone?: string
  customerId?: string
  // Optional metadata for mixed-credit flows where almacen and catalog credit
  // should be linked to different customer ledgers.
  almacenCustomerAccountId?: string
  almacenCustomerName?: string
  almacenCustomerPhone?: string
  almacenSourceCustomerId?: string | null
  status: "completada" | "devuelta_parcial" | "devuelta_completa" | "anulada" | "credito" | "pending"
  creditResolved?: boolean
  manualPaidChecked?: boolean
  subtotal?: number
  tax?: number
  discount?: number
  isWholesale?: boolean
  createdByEmployeeId?: string
}

export interface ManualInvoiceItem {
  id: string
  quantity: number
  description: string
  price: number
  cost?: number
}

export interface Supplier {
  id: string
  name: string
  rnc: string
  razonSocial: string
  tipoEmpresa: string
  website?: string
  contact: string
  phone: string
  email: string
  address: string
  debt: number
  totalPurchases: number
}

export interface Customer {
  id: string
  name: string
  cedula: string
  phone: string
  email: string
  address: string
  status: "En proceso" | "Finalizado"
  creditDevice: string
  notes: string
  debt: number
  totalPurchases: number
  creditBalance: number // Crédito a favor
  creditLimit?: number
  reminderEnabled?: boolean
  reminderIntervalDays?: number
  reminderLastSentAt?: string | null
  reminderMessage?: string | null
}

export interface Payment {
  id: string
  customerId: string
  amount: number
  date: string
  invoiceNumber: string
  previousDebt: number
  remainingDebt: number
  paymentMethod: PaymentMethod
  paymentKind: PaymentRecordKind
  note?: string
  customerType: "general" | "almacen"
  createdByEmployeeId?: string
  createdByEmployeeName?: string
}

export interface PaymentAllocationRecord {
  id: string
  paymentId: string
  saleId: string
  invoiceNumber: string
  appliedAmount: number
  pendingBefore: number
  pendingAfter: number
}

const DEFAULT_REMINDER_INTERVAL_DAYS = 15
const MAX_REMINDER_INTERVAL_DAYS = 30

const normalizeReminderIntervalDays = (value?: number | string | null) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_INTERVAL_DAYS
  return Math.min(MAX_REMINDER_INTERVAL_DAYS, Math.max(1, Math.round(parsed)))
}

export interface PurchaseItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Purchase {
  id: string
  invoiceNumber: string
  date: string
  supplierId: string
  supplierName: string
  items: PurchaseItem[]
  subtotal: number
  tax: number
  total: number
  paymentType: "contado" | "credito"
  paymentMethod?: "cash" | "card" | "transfer"
  amountPaid: number
  dueDate?: string
  status: "pendiente" | "parcial" | "pagado"
  notes?: string
  /** Clasifica la compra: repuestos/piezas, productos de inventario u otros gastos sin inventario. */
  purchaseKind?: "piezas" | "productos" | "otros"
  /** URL pública del documento original de la factura (PDF o foto) en Supabase Storage. */
  attachmentUrl?: string
  /** MIME type del adjunto, ej. "application/pdf" o "image/jpeg". */
  attachmentType?: string
}

export interface SupplierPayment {
  id: string
  supplierId: string
  purchaseId?: string
  amount: number
  date: string
  paymentMethod: "cash" | "card" | "transfer"
  previousDebt: number
  remainingDebt: number
  note?: string
  /** URL pública del comprobante de pago (foto/PDF) adjunto al abono. */
  attachmentUrl?: string
}

export interface RepairStatusHistoryEntry {
  fromStatus: string
  toStatus: string
  changedAt: string
  changedByEmployeeId?: string
  changedByEmployeeName?: string
}

export interface Repair {
  id: string
  client: string
  device: string
  issue: string
  status: string
  type: string
  date: string
  createdAt?: string
  cost: string
  password?: string
  ticket_pdf_url?: string // Added for PDF URL
  repair_number?: string
  customerPhone?: string
  whatsapp?: string
  cedula?: string
  brand?: string
  model?: string
  imei?: string
  color?: string
  unlockPattern?: string
  visualNotes?: string
  technicianNotes?: string
  checklist?: any
  deposit?: number
  pendingBalance?: number
  technician?: string
  serviceItems?: Array<{ name: string; pieceCost: number; charge: number }>
  photos?: RepairPhoto[]
  createdByEmployeeId?: string
  createdByEmployeeName?: string
  statusHistory?: RepairStatusHistoryEntry[]
}

export interface RepairHistory extends Repair {
  originalRepairId?: string
  archivedAt: string
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  category: string
  paymentMethod: string
  userName: string
  userId?: string
  createdAt?: string
}

export interface ReturnItem {
  id: string
  productId: string
  sourceTable: SaleItemSource
  sourceId: string
  productName: string
  imei?: string
  quantity: number
  unitPrice: number
  buyPrice?: number
  subtotal: number
  accountingVersion?: 2
}

export interface Return {
  id: string
  returnNumber: string
  invoiceId: string
  invoiceNumber: string
  customerId?: string
  customerName?: string
  date: string
  items: ReturnItem[]
  total: number
  type: "reembolso" | "transferencia" | "credito"
  reason: string
  status: "completa" | "parcial"
  returnToInventory?: boolean // Whether items are returned to stock (default true)
  accountingVersion?: 2
}

export interface AuthUser {
  id: string
  role: "super_admin" | "admin" | "employee"
  tenantRole: "super_admin" | "admin" | "employee"
  ownerAdminId: string
  adminId: string
  name: string
  email: string
  permissions?: Employee["permissions"]
}

interface UserCredentials {
  email: string
  password: string
  role: "admin" | "employee"
  name: string
}

export interface Employee {
  id: string
  name: string
  email: string
  password: string
  phone: string
  role: "admin" | "employee"
  ownerAdminId?: string | null
  cedula: string
  address: string
  hireDate: string
  salary: number
  status: "active" | "inactive"
  permissions: {
    sales: boolean
    inventory: boolean
    customers: boolean
    suppliers: boolean
    reports: boolean
    repairs: boolean
    queueExclusive: boolean
    returns: boolean
    purchases: boolean
    employees: boolean
    cashClosing: boolean
    invoiceHistory: boolean
    products: boolean
    almacen: boolean
    clienteAlmacen: boolean
    almacenClosing: boolean
    almacenInvoiceHistory: boolean
    wholesaleSales: boolean
    wholesaleDiscounts: boolean
    turnReport: boolean
    importCustomers: boolean
    canAdd: boolean
    canEdit: boolean
    canDelete: boolean
  }
}

type EmployeeCrudPermission = "canAdd" | "canEdit" | "canDelete"

// Helper functions for data mapping
const mapProductFromDB = (rec: any, sourceTable: InventorySourceTable): Product => {
  const sourceId = String(rec.id ?? "").trim()

  return {
    id: buildSourceRuntimeId(sourceTable, sourceId),
    sourceTable,
    sourceId,
    sku: rec.sku != null ? String(rec.sku) : "",
    name: rec.name != null ? String(rec.name) : "",
    imageUrl: typeof rec.image_url === "string" && rec.image_url ? rec.image_url : undefined,
    category: rec.category != null ? String(rec.category) : "",
    boxNumber: rec.box_number == null ? undefined : String(rec.box_number),
    stock: Number(rec.stock) || 0,
    minStock: Number(rec.min_stock) || 0,
    buyPrice: Number(rec.buy_price) || 0,
    wholesalePrice: Number(rec.wholesale_price) || 0,
    sellPrice: Number(rec.sell_price) || 0,
    supplier: rec.supplier != null ? String(rec.supplier) : "",
    capacity: rec.capacity == null ? undefined : String(rec.capacity),
    imei: rec.imei == null ? undefined : String(rec.imei),
  }
}

const sanitizeStoredCartItem = (item: any): CartItem | null => {
  if (!item || typeof item !== "object") return null

  const fallbackSource = looksLikeManualItem(item) ? "manual" : undefined
  const resolvedSource = resolveSaleItemSource(item, fallbackSource)
  if (!resolvedSource) return null

  const quantity = Number(item.quantity)
  const stock = Number(item.stock)
  const minStock = Number(item.minStock)
  const buyPrice = Number(item.buyPrice)
  const wholesalePrice = Number(item.wholesalePrice)
  const sellPrice = Number(item.sellPrice ?? item.price)
  const customPrice = Number(item.customPrice)

  return {
    id: normalizeRuntimeItemId(item, resolvedSource.sourceTable),
    cartId:
      typeof item.cartId === "string" && item.cartId.trim().length > 0
        ? item.cartId
        : `${resolvedSource.runtimeId}-${Math.random().toString(36).slice(2, 8)}`,
    sourceTable: resolvedSource.sourceTable,
    sourceId: resolvedSource.sourceId,
    sku: typeof item.sku === "string" ? item.sku : "",
    name:
      typeof item.name === "string" && item.name.trim().length > 0
        ? item.name
        : typeof item.description === "string" && item.description.trim().length > 0
          ? item.description
          : "Producto",
    category: typeof item.category === "string" ? item.category : "",
    boxNumber: item.boxNumber == null ? undefined : String(item.boxNumber),
    stock: Number.isFinite(stock) ? stock : 0,
    minStock: Number.isFinite(minStock) ? minStock : 0,
    buyPrice: Number.isFinite(buyPrice) ? buyPrice : 0,
    wholesalePrice: Number.isFinite(wholesalePrice) ? wholesalePrice : 0,
    sellPrice: Number.isFinite(sellPrice) ? sellPrice : 0,
    supplier: typeof item.supplier === "string" ? item.supplier : "",
    capacity: item.capacity == null ? undefined : String(item.capacity),
    imei: item.imei == null ? undefined : String(item.imei),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    customPrice: Number.isFinite(customPrice) && customPrice >= 0 ? customPrice : undefined,
    accountingVersion: item.accountingVersion === 2 ? 2 : undefined,
  }
}

const sanitizeStoredReturnItem = (item: any): ReturnItem | null => {
  if (!item || typeof item !== "object") return null

  const fallbackSource = looksLikeManualItem(item) ? "manual" : undefined
  const resolvedSource = resolveSaleItemSource(item, fallbackSource)
  if (!resolvedSource) return null

  const quantity = Math.max(0, Number(item.quantity) || 0)
  const unitPrice = Number(item.unitPrice ?? item.sellPrice ?? item.customPrice ?? item.price ?? 0)
  const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
  const buyPrice = Number(item.buyPrice)
  const subtotal = Number(item.subtotal)

  return {
    id:
      typeof item.id === "string" && item.id.trim().length > 0
        ? item.id
        : `${resolvedSource.runtimeId}-return-${Math.random().toString(36).slice(2, 8)}`,
    productId: normalizeRuntimeItemId(item, resolvedSource.sourceTable),
    sourceTable: resolvedSource.sourceTable,
    sourceId: resolvedSource.sourceId,
    productName:
      typeof item.productName === "string" && item.productName.trim().length > 0
        ? item.productName
        : typeof item.name === "string" && item.name.trim().length > 0
          ? item.name
          : "Producto",
    imei: item.imei == null ? undefined : String(item.imei),
    quantity,
    unitPrice: safeUnitPrice,
    buyPrice: Number.isFinite(buyPrice) ? Math.max(0, buyPrice) : undefined,
    subtotal: Number.isFinite(subtotal) ? subtotal : safeUnitPrice * quantity,
    accountingVersion: item.accountingVersion === 2 ? 2 : undefined,
  }
}

type InventoryTableName = "products" | "armacen"

const isAlmacenInventoryProduct = (product?: Partial<Product> | null) => {
  const explicitSource = normalizeInventorySourceTable(product?.sourceTable)
  if (explicitSource) return explicitSource === "armacen"
  return Boolean(normalizeAlmacenBoxNumber(product?.boxNumber) || isAlmacenCategory(product?.category))
}

const getInventoryTableName = (product?: Partial<Product> | null): InventoryTableName => {
  const explicitSource = normalizeInventorySourceTable(product?.sourceTable)
  if (explicitSource) return explicitSource
  return isAlmacenInventoryProduct(product) ? "armacen" : "products"
}

const parseNumberValue = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// Las columnas de trazabilidad en Supabase son UUID. Algunos usuarios
// antiguos/invitados tienen un identificador local (por ejemplo, "invitado")
// que no se puede insertar en created_by_employee_id.
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())

const readEmployeeIdFromRecord = (record: Record<string, unknown> | null | undefined) => {
  const candidateValues = [
    record?.createdByEmployeeId,
    record?.created_by_employee_id,
    record?.createdBy,
    record?.created_by,
    record?.employeeId,
    record?.employee_id,
    record?.userId,
    record?.user_id,
  ]

  for (const value of candidateValues) {
    if (typeof value === "string" && value.trim()) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }

  return undefined
}

const readPaymentResponsibleName = (record: Record<string, unknown> | null | undefined) => {
  const directName = record?.createdByEmployeeName ?? record?.created_by_name
  if (typeof directName === "string" && directName.trim()) return directName.trim()

  const note = typeof record?.note === "string" ? record.note : ""
  const match = note.match(/\[Responsable del pago:\s*([^\]]+)\]/i)
  return match?.[1]?.trim() || undefined
}

const appendPaymentResponsibleNote = (note: string | undefined, name: string | undefined) => {
  if (!name?.trim()) return note
  const responsibleTag = `[Responsable del pago: ${name.trim()}]`
  if (note?.includes(responsibleTag)) return note
  return note ? `${note} ${responsibleTag}` : responsibleTag
}

const mergeInventoryProducts = (catalogProducts: Product[], almacenProducts: Product[]) => [...almacenProducts, ...catalogProducts]

const mapSaleFromDB = (rec: any): Sale => ({
  id: rec.id,
  invoiceNumber: rec.invoice_number,
  date: rec.date,
  createdAt: rec.created_at ?? undefined,
  items: Array.isArray(rec.items) ? rec.items.map(sanitizeStoredCartItem).filter(Boolean) as CartItem[] : [],
  subtotal: Number.parseFloat(rec.subtotal) || 0,
  tax: Number.parseFloat(rec.tax) || 0,
  total: Number.parseFloat(rec.total) || 0,
  amountPaid: Number.parseFloat(rec.amount_paid) || 0,
  change: Number.parseFloat(rec.change) || 0,
  paymentMethod: normalizePaymentMethod(rec.payment_method),
  customerName: rec.customer_name,
  customerPhone: rec.customer_phone,
  customerId: rec.customer_id,
  status: rec.status || "completada",
  creditResolved: Boolean(rec.credit_resolved ?? false),
  manualPaidChecked: Boolean(rec.manual_paid_checked ?? false),
  almacenCustomerAccountId: rec.almacen_customer_account_id ?? undefined,
  almacenCustomerName: rec.almacen_customer_name ?? undefined,
  almacenCustomerPhone: rec.almacen_customer_phone ?? undefined,
  almacenSourceCustomerId: rec.almacen_source_customer_id ?? undefined,
  isWholesale: Boolean(rec.is_wholesale ?? false),
  createdByEmployeeId: readEmployeeIdFromRecord(rec) ?? undefined,
})

const mapCustomerFromDB = (rec: any): Customer => ({
  id: rec.id,
  name: rec.name,
  cedula: rec.cedula || "",
  phone: rec.phone || "",
  email: rec.email || "",
  address: rec.address || "",
  status: rec.status || "En proceso",
  creditDevice: rec.credit_device || "",
  notes: rec.notes || "",
  debt: parseNumberValue(rec.debt),
  totalPurchases: parseNumberValue(rec.total_purchases),
  creditBalance: parseNumberValue(rec.credit_balance),
  creditLimit: parseNumberValue(rec.credit_limit),
  reminderEnabled: rec.reminder_enabled ?? false,
  reminderIntervalDays: normalizeReminderIntervalDays(rec.reminder_interval_days),
  reminderLastSentAt: rec.reminder_last_sent_at ?? null,
  reminderMessage: rec.reminder_message ?? null,
})

const mapSupplierFromDB = (rec: any): Supplier => ({
  id: rec.id,
  name: rec.name,
  rnc: rec.rnc || "",
  razonSocial: rec.razon_social || "",
  tipoEmpresa: rec.tipo_empresa || "",
  website: rec.website || "",
  contact: rec.contact || "",
  phone: rec.phone || "",
  email: rec.email || "",
  address: rec.address || "",
  debt: Number(rec.debt) || 0,
  totalPurchases: Number(rec.total_purchases) || 0,
})

const coercePermissionFlag = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "yes", "si", "on", "enabled", "active"].includes(normalized)) {
      return true
    }
    if (["false", "0", "no", "off", "disabled", "inactive", ""].includes(normalized)) {
      return false
    }
  }
  return fallback
}

const normalizeEmployeePermissions = (permissions: any): Employee["permissions"] => ({
  sales: coercePermissionFlag(permissions?.sales, false),
  inventory: coercePermissionFlag(permissions?.inventory, false),
  customers: coercePermissionFlag(permissions?.customers, false),
  suppliers: coercePermissionFlag(permissions?.suppliers, false),
  reports: coercePermissionFlag(permissions?.reports, false),
  repairs: coercePermissionFlag(permissions?.repairs, false),
  // Backward compatibility: if the dedicated queue permission is missing, reuse sales permission.
  queueExclusive: coercePermissionFlag(permissions?.queueExclusive ?? permissions?.sales, false),
  returns: coercePermissionFlag(permissions?.returns, false),
  purchases: coercePermissionFlag(permissions?.purchases, false),
  importCustomers: coercePermissionFlag(permissions?.importCustomers, false),
  employees: coercePermissionFlag(permissions?.employees, false),
  cashClosing: coercePermissionFlag(permissions?.cashClosing, false),
  invoiceHistory: coercePermissionFlag(permissions?.invoiceHistory, false),
  products: coercePermissionFlag(permissions?.products, false),
  almacen: coercePermissionFlag(permissions?.almacen, false),
  clienteAlmacen: coercePermissionFlag(permissions?.clienteAlmacen, false),
  almacenClosing: coercePermissionFlag(permissions?.almacenClosing, false),
  almacenInvoiceHistory: coercePermissionFlag(permissions?.almacenInvoiceHistory, false),
  wholesaleSales: coercePermissionFlag(permissions?.wholesaleSales, false),
  wholesaleDiscounts: coercePermissionFlag(permissions?.wholesaleDiscounts, false),
  turnReport: coercePermissionFlag(permissions?.turnReport, false),
  canAdd: coercePermissionFlag(permissions?.canAdd ?? permissions?.can_add, false),
  canEdit: coercePermissionFlag(permissions?.canEdit ?? permissions?.can_edit, false),
  canDelete: coercePermissionFlag(permissions?.canDelete ?? permissions?.can_delete, false),
})

const mapEmployeeFromDB = (rec: any): Employee => ({
  id: rec.id,
  name: rec.name,
  email: rec.email,
  password: rec.password,
  phone: rec.phone || "",
  role:
    rec.role === "super_admin" || rec.role === "admin" || rec.role === "employee"
      ? (rec.role as "super_admin" | "admin" | "employee")
      : "employee",
  ownerAdminId: rec.owner_admin_id ?? null,
  cedula: rec.cedula,
  address: rec.address || "",
  hireDate: rec.hire_date,
  salary: Number.parseFloat(rec.salary) || 0,
  status: rec.status as "active" | "inactive",
  permissions: normalizeEmployeePermissions(rec.permissions),
})

const mapPaymentFromDB = (rec: any): Payment => ({
  id: rec.id,
  invoiceNumber: rec.invoice_number,
  customerId: rec.customer_id,
  amount: Number.parseFloat(rec.amount) || 0,
  previousDebt: Number.parseFloat(rec.previous_debt) || 0,
  remainingDebt: Number.parseFloat(rec.remaining_debt) || 0,
  date: rec.date,
  paymentMethod: normalizePaymentMethod(rec.payment_method),
  paymentKind: normalizePaymentRecordKind(rec.payment_kind),
  note: rec.note || undefined,
  customerType: rec.customer_type === "almacen" ? "almacen" : "general",
  createdByEmployeeId: readEmployeeIdFromRecord(rec) ?? undefined,
  createdByEmployeeName: readPaymentResponsibleName(rec),
})

const mapPaymentAllocationFromDB = (rec: any): PaymentAllocationRecord => ({
  id: rec.id,
  paymentId: rec.payment_id,
  saleId: rec.sale_id,
  invoiceNumber: rec.invoice_number || "",
  appliedAmount: Number.parseFloat(rec.applied_amount) || 0,
  pendingBefore: Number.parseFloat(rec.pending_before) || 0,
  pendingAfter: Number.parseFloat(rec.pending_after) || 0,
})

const mapPurchaseFromDB = (rec: any): Purchase => ({
  id: rec.id,
  invoiceNumber: rec.invoice_number,
  date: rec.date,
  supplierId: rec.supplier_id,
  supplierName: rec.supplier_name,
  items: rec.items || [],
  subtotal: Number(rec.subtotal) || 0,
  tax: Number(rec.tax) || 0,
  total: Number(rec.total) || 0,
  paymentType: rec.payment_type || "contado",
  paymentMethod: rec.payment_method,
  amountPaid: Number(rec.amount_paid) || 0,
  dueDate: rec.due_date,
  status: rec.status || "pendiente",
  notes: rec.notes || undefined,
  purchaseKind: rec.purchase_kind || "productos",
  attachmentUrl: rec.attachment_url || undefined,
  attachmentType: rec.attachment_type || undefined,
})

const mapSupplierPaymentFromDB = (rec: any): SupplierPayment => ({
  id: rec.id,
  supplierId: rec.supplier_id,
  purchaseId: rec.purchase_id,
  amount: Number(rec.amount) || 0,
  date: rec.date,
  paymentMethod: rec.payment_method,
  previousDebt: Number(rec.previous_debt) || 0,
  remainingDebt: Number(rec.remaining_debt) || 0,
  note: rec.note || undefined,
  attachmentUrl: rec.attachment_url || undefined,
})

const mapReturnFromDB = (rec: any): Return => ({
  id: rec.id,
  returnNumber: rec.return_number,
  invoiceId: rec.invoice_id,
  invoiceNumber: rec.invoice_number,
  customerId: rec.customer_id,
  customerName: rec.customer_name,
  date: rec.date,
  items: Array.isArray(rec.items) ? rec.items.map(sanitizeStoredReturnItem).filter(Boolean) as ReturnItem[] : [],
  total: Number(rec.total) || 0,
  type: rec.type as "reembolso" | "credito" | "cambio",
  reason: rec.reason,
  status: rec.status as "completa" | "parcial",
  newInvoiceId: rec.new_invoice_id,
  returnToInventory: rec.return_to_inventory,
  accountingVersion: Array.isArray(rec.items) && rec.items.some((item: any) => item?.accountingVersion === 2) ? 2 : undefined,
  createdByEmployeeId: rec.created_by_employee_id || rec.createdByEmployeeId || rec.user_id,
  createdByEmployeeName: rec.created_by_employee_name || rec.createdByEmployeeName || rec.user_name,
})

const mapRepairFromDB = (rec: any): Repair => {
  let parsedNotes: any = {}
  if (rec.notes && typeof rec.notes === "string" && rec.notes.trim().startsWith("{")) {
    try {
      parsedNotes = JSON.parse(rec.notes)
    } catch (e) {
      // not JSON
    }
  }

  const customerPhone =
    rec.customer_phone ||
    rec.customerPhone ||
    rec.phone ||
    parsedNotes.customerPhone ||
    parsedNotes.whatsapp ||
    parsedNotes.phone ||
    ""

  const whatsapp =
    rec.whatsapp ||
    parsedNotes.whatsapp ||
    customerPhone ||
    ""

  return {
    id: rec.id,
    repair_number: rec.repair_number || parsedNotes.repair_number,
    client: rec.client || parsedNotes.client || "Cliente",
    device: rec.device || parsedNotes.device || "",
    // Keep the value stored in the metadata as a fallback/source of truth for
    // older schemas or sync events where the `issue` column is empty.
    issue: parsedNotes.issue || rec.issue || "",
    status: rec.status || parsedNotes.status || "recibido",
    type: rec.type || parsedNotes.type || "Reparación",
    date: rec.date || parsedNotes.date || new Date().toISOString(),
    createdAt: rec.created_at || rec.createdAt || rec.date || parsedNotes.date || undefined,
    cost: (rec.cost ?? parsedNotes.cost ?? 0).toString(),
    password: rec.password || parsedNotes.password || undefined,
    ticket_pdf_url: rec.ticket_pdf_url || parsedNotes.ticket_pdf_url || undefined,
    customerPhone: customerPhone || undefined,
    whatsapp: whatsapp || undefined,
    cedula: rec.cedula || parsedNotes.cedula || undefined,
    brand: rec.brand || parsedNotes.brand || undefined,
    model: rec.model || parsedNotes.model || undefined,
    imei: rec.imei || parsedNotes.imei || undefined,
    color: rec.color || parsedNotes.color || undefined,
    unlockPattern: rec.unlock_pattern || rec.unlockPattern || parsedNotes.unlockPattern || undefined,
    visualNotes: rec.visual_notes || rec.visualNotes || parsedNotes.visualNotes || undefined,
    technicianNotes: rec.technician_notes || rec.technicianNotes || parsedNotes.technicianNotes || undefined,
    checklist: rec.checklist ? (typeof rec.checklist === "string" ? JSON.parse(rec.checklist) : rec.checklist) : parsedNotes.checklist,
    deposit: Number(rec.deposit ?? parsedNotes.deposit ?? 0),
    pendingBalance: Number(rec.pending_balance ?? rec.pendingBalance ?? parsedNotes.pendingBalance ?? 0),
    technician: rec.technician || parsedNotes.technician || undefined,
    serviceItems: rec.service_items || parsedNotes.serviceItems || undefined,
    photos: Array.isArray(rec.photos) ? rec.photos : undefined,
    createdByEmployeeId: rec.created_by_employee_id || rec.createdByEmployeeId || parsedNotes.createdByEmployeeId || undefined,
    createdByEmployeeName: rec.created_by_employee_name || rec.createdByEmployeeName || parsedNotes.createdByEmployeeName || undefined,
    statusHistory: Array.isArray(parsedNotes.statusHistory) ? parsedNotes.statusHistory : undefined,
  }
}

const mapRepairHistoryFromDB = (rec: any): RepairHistory => {
  const stored = rec.repair_data && typeof rec.repair_data === "object" ? rec.repair_data : {}
  const repair = mapRepairFromDB({ ...stored, id: rec.id, client: rec.client, device: rec.device, repair_number: rec.repair_number, date: rec.repair_date })
  return {
    ...repair,
    originalRepairId: rec.original_repair_id || undefined,
    archivedAt: rec.archived_at || rec.created_at || new Date().toISOString(),
  }
}

const mapExpenseFromDB = (rec: any): Expense => ({
  id: rec.id,
  date: rec.date,
  description: rec.description,
  amount: Number(rec.amount) || 0,
  category: rec.category,
  paymentMethod: rec.payment_method,
  userName: rec.user_name,
  userId: rec.user_id,
  createdAt: rec.created_at,
})

const isMissingTableError = (error: any) => {
  if (!error) return false
  const message = String(error?.message ?? "").toLowerCase()
  const code = String(error?.code ?? "")
  const details = String(error?.details ?? "").toLowerCase()
  const hint = String(error?.hint ?? "").toLowerCase()
  return (
    code === "PGRST205" ||
    code === "PGRST204" ||
    code === "PGRST300" ||
    code === "PGRST301" ||
    code === "42P01" ||
    code === "42501" ||
    error?.status === 404 ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("permission denied") ||
    message.includes("failed to fetch") ||
    details.includes("does not exist") ||
    details.includes("could not find") ||
    hint.includes("does not exist")
  )
}

const isMissingColumnError = (error: any, columnName: string) => {
  const message = String(error?.message ?? "").toLowerCase()
  const normalizedColumn = columnName.trim().toLowerCase()
  return message.includes(normalizedColumn) && (message.includes("column") || message.includes("schema cache"))
}

const USERS: UserCredentials[] = []

const INITIAL_PRODUCTS: Product[] = []

const INITIAL_SUPPLIERS: Supplier[] = []

const INITIAL_CUSTOMERS: Customer[] = []

const INITIAL_REPAIRS: Repair[] = []

const INITIAL_EMPLOYEES: Employee[] = []

const INITIAL_EXPENSES: Expense[] = []

interface StoreContextType {
  products: Product[]
  sales: Sale[]
  suppliers: Supplier[]
  customers: Customer[]
  payments: Payment[]
  paymentAllocations: PaymentAllocationRecord[]
  createAlmacenSale: (params: {
    items: CartItem[]
    paymentMethod: PaymentMethod
    amountPaid: number
    customerName?: string
    customerPhone?: string
    sourceCustomerId?: string | null
  }) => Promise<{ success: boolean; sale?: Sale; error?: any }>
  repairs: Repair[]
  repairHistory: RepairHistory[]
  purchases: Purchase[]
  supplierPayments: SupplierPayment[]
  returns: Return[]
  employees: Employee[]
  expenses: Expense[]
  cart: CartItem[]
  setCart: (cart: CartItem[]) => void
  addToCart: (product: Product | Partial<CartItem>) => void
  removeFromCart: (cartId: string) => void
  updateCartItemQuantity: (cartId: string, quantity: number) => void
  updateCartItemPrice: (cartId: string, customPrice: number) => void
  clearCart: () => void
  addSupplier: (supplier: Omit<Supplier, "id">) => Promise<void>
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>
  deleteSupplier: (id: string) => Promise<void>
  addCustomer: (customer: Omit<Customer, "id">) => Promise<string | undefined>
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  addPayment: (
    payment: Omit<Payment, "id" | "date" | "invoiceNumber" | "paymentKind" | "customerType"> &
      Partial<Pick<Payment, "paymentKind" | "customerType">> & {
        allocations?: Array<
          Pick<PaymentAllocationRecord, "saleId" | "invoiceNumber" | "appliedAmount" | "pendingBefore" | "pendingAfter">
        >
      },
  ) => Promise<Payment>
  deletePayment: (id: string) => Promise<void>
  addPurchase: (purchase: Omit<Purchase, "id" | "invoiceNumber" | "date">) => Promise<Purchase>
  updatePurchase: (id: string, purchase: Partial<Purchase>) => Promise<void>
  addSupplierPayment: (payment: Omit<SupplierPayment, "id" | "date" | "previousDebt" | "remainingDebt">) => Promise<SupplierPayment[]>
  addReturn: (returnData: Omit<Return, "id" | "returnNumber" | "date">) => Promise<Return>
  cancelReturn: (returnId: string) => Promise<void>
  getReturnsByInvoice: (invoiceId: string) => Return[]
  getReturnedQuantity: (invoiceId: string, productId: string) => number
  onDialogOpen?: () => void
  setOnDialogOpen?: (callback: () => void) => void
  currentTab: string
  setCurrentTab: (tab: string) => void
  addProduct: (product: Omit<Product, "id">) => Promise<void>
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  addSale: (sale: Sale) => Promise<{ success: boolean; error?: any }>
  updateSale: (id: string, sale: Partial<Sale>) => Promise<void>
  deleteSale: (id: string) => Promise<void>
  addRepair: (repair: Omit<Repair, "id" | "date">) => Promise<string>
  updateRepair: (id: string, repair: Partial<Repair>) => Promise<void>
  deleteRepair: (id: string) => Promise<void>
  archiveRepair: (repair: Repair) => Promise<void>
  showManualInvoiceDialog: boolean
  setShowManualInvoiceDialog: (show: boolean) => void
  addManualSale: (
    sale: Omit<Sale, "id" | "invoiceNumber" | "date" | "items"> & { manualItems: ManualInvoiceItem[] },
  ) => Sale
  currentUser: AuthUser | null
  canCurrentUserPerform: (permission: EmployeeCrudPermission) => boolean
  isTableMissing: (table: string) => boolean
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; role?: "super_admin" | "admin" | "employee"; message?: string }>
  logout: () => void
  isAuthenticated: boolean
  addEmployee: (employee: Omit<Employee, "id">) => Promise<void>
  updateEmployee: (id: string, employee: Partial<Employee>) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  addExpense: (expense: Omit<Expense, "id">) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  refreshData: () => Promise<void>
  isInitializing: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS)
  const [sales, setSales] = useState<Sale[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocationRecord[]>([])
  const [repairs, setRepairs] = useState<Repair[]>(INITIAL_REPAIRS)
  const [repairHistory, setRepairHistory] = useState<RepairHistory[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([])
  const [returns, setReturns] = useState<Return[]>([])
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES)
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES)
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [onDialogOpenCallback, setOnDialogOpenCallback] = useState<(() => void) | undefined>()
  const [currentTab, setCurrentTab] = useState("pos")
  const [showManualInvoiceDialog, setShowManualInvoiceDialog] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [cart, setCartState] = useState<CartItem[]>([])
  const { toast } = useToast()

  const getTenantAdminId = useCallback(() => {
    if (!currentUser) return null
    const adminId = String(currentUser.adminId || currentUser.ownerAdminId || currentUser.id || "").trim()
    return adminId.length > 0 ? adminId : null
  }, [currentUser?.adminId, currentUser?.ownerAdminId, currentUser?.id])

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('current_user')
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser) as AuthUser
        const normalizedUser = {
          ...parsedUser,
          adminId: parsedUser.adminId || parsedUser.ownerAdminId || parsedUser.id || "",
          ownerAdminId: parsedUser.ownerAdminId || parsedUser.adminId || parsedUser.id || "",
          permissions: parsedUser.permissions
            ? normalizeEmployeePermissions(parsedUser.permissions)
            : undefined,
        }
        setCurrentUser(normalizedUser)
        console.log("[v0] Session restored from localStorage:", normalizedUser.email)
      }
    } catch (err) {
      console.error("[v0] Error restoring session from localStorage:", err)
      localStorage.removeItem('current_user')
    } finally {
      setIsInitializing(false)
    }
  }, [])

  const withTenantFilter = useCallback(
    (query: any, column = "owner_admin_id") => {
      const adminId = getTenantAdminId()
      if (!adminId) return query.eq(column, "__no_tenant__")
      return query.eq(column, adminId)
    },
    [getTenantAdminId],
  )

  const withTenantPayload = useCallback(
    <T extends Record<string, any>>(payload: T): T => {
      const adminId = currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || getTenantAdminId()
      if (!adminId) {
        throw new Error("No hay contexto de tenant activo para escribir en base de datos.")
      }
      if (payload.owner_admin_id !== undefined && payload.owner_admin_id !== null && `${payload.owner_admin_id}`.trim().length > 0) {
        return payload
      }
      return { ...payload, owner_admin_id: adminId }
    },
    [currentUser?.adminId, currentUser?.ownerAdminId, currentUser?.id, getTenantAdminId],
  )

  const isRecordVisibleToCurrentTenant = useCallback(
    (record: any) => {
      const adminId = getTenantAdminId()
      if (!adminId) return false
      return String(record?.owner_admin_id || "") === adminId
    },
    [getTenantAdminId],
  )

  const insertWithTenant = useCallback(
    (supabase: ReturnType<typeof createClient>, table: string, payload: Record<string, any>) =>
      supabase.from(table).insert(withTenantPayload(payload)),
    [withTenantPayload],
  )

  const updateWithTenant = useCallback(
    (supabase: ReturnType<typeof createClient>, table: string, payload: Record<string, any>) =>
      withTenantFilter(supabase.from(table).update(payload)),
    [withTenantFilter],
  )

  const deleteWithTenant = useCallback(
    (supabase: ReturnType<typeof createClient>, table: string) =>
      withTenantFilter(supabase.from(table).delete()),
    [withTenantFilter],
  )

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("salesCart")
      if (!savedCart) return

      const parsedCart = JSON.parse(savedCart)
      if (!Array.isArray(parsedCart)) {
        localStorage.removeItem("salesCart")
        return
      }

      const sanitizedCart = parsedCart
        .map((item) => sanitizeStoredCartItem(item))
        .filter((item): item is CartItem => item !== null)

      setCartState(sanitizedCart)

      if (sanitizedCart.length !== parsedCart.length) {
        localStorage.setItem("salesCart", JSON.stringify(sanitizedCart))
      }
    } catch (error) {
      console.error("Error loading cart from localStorage:", error)
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("salesCart", JSON.stringify(cart))
    } catch (error) {
      console.error("Error saving cart to localStorage:", error)
    }
  }, [cart])

  const setCart = (newCart: CartItem[]) => {
    setCartState(newCart.map((item) => normalizeCartItemForPersistence(item, item.sourceTable)))
  }

  const addToCart = (product: Product | Partial<CartItem>) => {
    const normalizedProduct = normalizeCartItemForPersistence(
      {
        ...product,
        cartId: Math.random().toString(),
        quantity: 1,
      },
      product.sourceTable ?? getInventoryTableName(product),
    )

    setCartState((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === normalizedProduct.id)
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === normalizedProduct.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      } else {
        return [...prevCart, normalizedProduct]
      }
    })
  }

  const removeFromCart = (cartId: string) => {
    setCartState((prevCart) => prevCart.filter((item) => item.cartId !== cartId))
  }

  const updateCartItemQuantity = (cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartId)
      return
    }
    setCartState((prevCart) =>
      prevCart.map((item) => (item.cartId === cartId ? { ...item, quantity } : item)),
    )
  }

  const updateCartItemPrice = (cartId: string, customPrice: number) => {
    setCartState((prevCart) =>
      prevCart.map((item) =>
        item.cartId === cartId ? { ...item, customPrice: customPrice >= 0 ? customPrice : undefined } : item,
      ),
    )
  }

  const clearCart = () => {
    setCartState([])
  }

  // Map para rastrear escrituras locales y medir latencia hasta el evento realtime
  const pendingLocalWritesRef = useRef<Map<string, number>>(new Map())
  const missingTablesRef = useRef<Set<string>>(new Set())
  const internalCrudBypassRef = useRef(0)

  const markPendingLocalWrite = useCallback((id: string) => {
    try {
      pendingLocalWritesRef.current.set(id, Date.now())
    } catch (err) {
      console.error("markPendingLocalWrite error:", err)
    }
  }, [])

  const markMissingTable = useCallback((table: string) => {
    try {
      missingTablesRef.current.add(table)
    } catch (err) {
      console.error("markMissingTable error:", err)
    }
  }, [])

  const isTableMissing = useCallback((table: string) => missingTablesRef.current.has(table), [])

  const handleRealtimeArrivalLatency = (rec: any) => {
    try {
      if (!rec || !rec.id) return
      const pending = pendingLocalWritesRef.current.get(rec.id)
      if (pending) {
        const latencyMs = Date.now() - pending
        console.log(`[realtime][local-propagation] id=${rec.id} latency=${latencyMs}ms`)
        pendingLocalWritesRef.current.delete(rec.id)
      }

      // Si el registro tiene timestamp en la BD, medir desde servidor
      const serverTs = rec.created_at || rec.date || rec.createdAt || rec.updated_at
      if (serverTs) {
        const parsed = Date.parse(serverTs)
        if (!isNaN(parsed)) {
          const serverToClientMs = Date.now() - parsed
          console.log(`[realtime][server-time] id=${rec.id} serverToClient=${serverToClientMs}ms serverTs=${serverTs}`)
        }
      }
    } catch (err) {
      console.error("handleRealtimeArrivalLatency error:", err)
    }
  }

  const fetchCustomers = useCallback(async () => {
    if (!currentUser) {
      setCustomers([])
      return
    }
    if (isTableMissing("customers")) return

    const supabase = createClient()
    console.log("[v0] Fetching customers...") // Added debug log
    const { data, error } = await withTenantFilter(
      supabase.from("customers").select("*"),
    ).order("created_at", { ascending: false })

    if (error) {
      markMissingTable("customers")
      setCustomers([])
      console.warn("[v0] Could not fetch customers:", error)
      return
    }

    if (data) {
      console.log("[v0] Customers fetched:", data.length) // Added debug log showing count
      console.log("[v0] Sample customer:", data[0]) // Added debug log showing first customer
      const formattedCustomers: Customer[] = data.map(mapCustomerFromDB)
      console.log("[v0] Setting customers state with", formattedCustomers.length, "customers") // Added debug log
      setCustomers(formattedCustomers)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchSuppliers = useCallback(async () => {
    if (!currentUser) {
      setSuppliers([])
      return
    }
    if (isTableMissing("suppliers")) return

    const supabase = createClient()
    console.log("[v0] Fetching suppliers...") // Added debug log
    const { data, error } = await withTenantFilter(
      supabase.from("suppliers").select("*"),
    ).order("created_at", { ascending: false })

    if (error) {
      markMissingTable("suppliers")
      setSuppliers([])
      console.warn("[v0] Could not fetch suppliers:", error)
      return
    }

    if (data) {
      console.log("[v0] Suppliers fetched:", data.length) // Added debug log
      const formattedSuppliers: Supplier[] = data.map(mapSupplierFromDB)
      setSuppliers(formattedSuppliers)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])


  const fetchEmployees = useCallback(async () => {
    try {
      if (!currentUser) {
        setEmployees([])
        return
      }
      if (isTableMissing("employees")) return

      const supabase = createClient()
      console.log("[v0] Fetching employees...")
      const employeeQuery = withTenantFilter(supabase.from("employees").select("*"))

      const { data, error } = await employeeQuery.order("created_at", { ascending: true })

      if (error) {
        markMissingTable("employees")
        setEmployees([])
        console.warn("[v0] Could not fetch employees:", error)
        return
      }

      if (data) {
        console.log("[v0] Employees fetched:", data.length)
        const mappedEmployees: Employee[] = data.map(mapEmployeeFromDB)
        setEmployees(mappedEmployees)
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        markMissingTable("employees")
        setEmployees([])
      } else {
        console.warn("[v0] Could not load employees:", error)
      }
    } finally {
      setEmployeesLoading(false)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchSales = useCallback(async () => {
    if (!currentUser) {
      setSales([])
      return
    }
    if (isTableMissing("sales")) return

    const supabase = createClient()
    console.log("[v0] Fetching sales...")
    const { data, error } = await withTenantFilter(supabase.from("sales").select("*")).order("created_at", {
      ascending: false,
    })

    if (error) {
      markMissingTable("sales")
      setSales([])
      console.warn("[v0] Could not fetch sales:", error)
      return
    }

    if (data) {
      console.log("[v0] Sales fetched:", data.length)
      const formattedSales: Sale[] = data.map(mapSaleFromDB)
      setSales(formattedSales)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchReturns = useCallback(async () => {
    if (!currentUser) {
      setReturns([])
      return
    }
    if (isTableMissing("returns")) return

    const supabase = createClient()
    console.log("[v0] Fetching returns...")
    const { data: returnsData, error: returnsError } = await withTenantFilter(
      supabase.from("returns").select("*"),
    ).order("created_at", { ascending: false })

    if (returnsError) {
      markMissingTable("returns")
      setReturns([])
      console.warn("[v0] Could not fetch returns:", returnsError)
      return
    } else {
      console.log("[v0] Returns fetched:", returnsData?.length || 0)

      const formattedReturns: Return[] = (returnsData || []).map(mapReturnFromDB)
      setReturns(formattedReturns)
      console.log("[v0] Returns loaded into state:", formattedReturns.length)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchPayments = useCallback(async () => {
    if (!currentUser) {
      setPayments([])
      return
    }
    if (isTableMissing("payments")) return

    const supabase = createClient()
    console.log("[v0] Fetching payments...")
    const { data, error } = await withTenantFilter(
      supabase.from("payments").select("*"),
    ).order("date", { ascending: false })

    if (error) {
      markMissingTable("payments")
      setPayments([])
      console.warn("[v0] Could not fetch payments:", error)
      return
    }

    if (data) {
      console.log("[v0] Payments fetched:", data.length)
      const formattedPayments: Payment[] = data.map(mapPaymentFromDB)
      setPayments(formattedPayments)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchPaymentAllocations = useCallback(async () => {
    if (!currentUser) {
      setPaymentAllocations([])
      return
    }
    if (isTableMissing("payment_allocations")) return

    const supabase = createClient()
    const { data, error } = await withTenantFilter(
      supabase.from("payment_allocations").select("*"),
    ).order("created_at", { ascending: false })

    if (error) {
      markMissingTable("payment_allocations")
      setPaymentAllocations([])
      console.warn("[v0] Could not fetch payment allocations:", error)
      return
    }

    if (data) {
      setPaymentAllocations(data.map(mapPaymentAllocationFromDB))
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchProducts = useCallback(async () => {
    try {
      if (!currentUser) {
        setProducts([])
        return
      }
      if (isTableMissing("products")) return

      const supabase = createClient()
      console.log("[v0] Fetching products...")
      const { data, error } = await withTenantFilter(
        supabase.from("products").select("*"),
      ).order("created_at", { ascending: false })

      if (error) {
        markMissingTable("products")
        setProducts([])
        console.warn("[v0] Could not fetch products:", error)
        return
      }

      let formattedAlmacenProducts: Product[] = []

      if (!isTableMissing("armacen")) {
        const armacenQuery = withTenantFilter(supabase.from("armacen").select("*"))
        const { data: armacenData, error: armacenError } = await armacenQuery.order("created_at", {
          ascending: false,
        })

        if (armacenError) {
          markMissingTable("armacen")
          console.warn("[v0] Could not fetch armacen:", armacenError)
        } else if (armacenData) {
          formattedAlmacenProducts = armacenData.map((row) => mapProductFromDB(row, "armacen"))
        }
      }

      if (data) {
        console.log("[v0] Products fetched successfully:", data.length, "products")
        const formattedProducts: Product[] = data.map((row) => mapProductFromDB(row, "products"))
        const mergedProducts = mergeInventoryProducts(formattedProducts, formattedAlmacenProducts)
        console.log("[v0] Setting products state with", mergedProducts.length, "products")
        setProducts(mergedProducts)
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        markMissingTable("products")
        setProducts([])
      } else {
        console.warn("[v0] Could not fetch products:", error)
      }
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchRepairs = useCallback(async () => {
    try {
      if (!currentUser) {
        setRepairs([])
        return
      }
      if (isTableMissing("repairs")) {
        setRepairs([])
        return
      }

      const supabase = createClient()
      console.log("[v0] Fetching repairs...")
      // Fallback para proyectos donde pg_cron todavía no esté habilitado.
      void supabase.rpc("cleanup_expired_repair_photos").then(({ error }) => {
        if (error) console.warn("[v0] Repair photo cleanup was not executed:", error.message)
      })
      const { data, error } = await withTenantFilter(
        supabase.from("repairs").select("*"),
      ).order("created_at", { ascending: false })

      if (error) {
        markMissingTable("repairs")
        setRepairs([])
        console.warn("[v0] Could not fetch repairs:", error)
        return
      }

      if (data) {
        console.log("[v0] Repairs fetched:", data.length)
        let photosByRepair = new Map<string, RepairPhoto[]>()
        try {
          const photoResult = await withTenantFilter(
            supabase.from("repair_photos").select("*")
          ).order("uploaded_at", { ascending: true })
          if (!photoResult.error && photoResult.data) {
            photosByRepair = photoResult.data.reduce((result: Map<string, RepairPhoto[]>, row: any) => {
              const photos = result.get(row.repair_id) || []
              photos.push({
                id: row.id,
                repairId: row.repair_id,
                storagePath: row.storage_path,
                fileName: row.file_name,
                mimeType: row.mime_type,
                sizeBytes: Number(row.size_bytes) || 0,
                uploadedAt: row.uploaded_at,
                expiresAt: row.expires_at,
              })
              result.set(row.repair_id, photos)
              return result
            }, new Map<string, RepairPhoto[]>())
          }
        } catch (photoError) {
          console.warn("[v0] Could not fetch repair photos:", photoError)
        }
        const servicesByRepair = new Map<string, Array<{ name: string; pieceCost: number; charge: number }>>()
        try {
          const serviceResult = await withTenantFilter(
            supabase.from("repair_services").select("*")
          ).order("sort_order", { ascending: true })
          if (!serviceResult.error && serviceResult.data) {
            serviceResult.data.forEach((row: any) => {
              const services = servicesByRepair.get(row.repair_id) || []
              services.push({ name: row.name, pieceCost: Number(row.piece_cost) || 0, charge: Number(row.charge) || 0 })
              servicesByRepair.set(row.repair_id, services)
            })
          }
        } catch (serviceError) {
          console.warn("[v0] Could not fetch repair service details:", serviceError)
        }
        const formattedRepairs: Repair[] = data.map((row: any) => ({
          ...mapRepairFromDB(row),
          serviceItems: servicesByRepair.get(row.id) || mapRepairFromDB(row).serviceItems || [],
          photos: photosByRepair.get(row.id) || [],
        }))
        setRepairs(formattedRepairs)
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        markMissingTable("repairs")
        setRepairs([])
      } else {
        console.warn("[v0] Could not fetch repairs:", error)
      }
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchRepairHistory = useCallback(async () => {
    if (!currentUser || isTableMissing("repair_history")) {
      setRepairHistory([])
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await withTenantFilter(
        supabase.from("repair_history").select("*")
      ).order("archived_at", { ascending: false })

      if (error) {
        if (isMissingTableError(error)) markMissingTable("repair_history")
        setRepairHistory([])
        console.warn("[v0] Could not fetch repair history:", error)
        return
      }
      setRepairHistory((data || []).map(mapRepairHistoryFromDB))
    } catch (error) {
      if (isMissingTableError(error)) markMissingTable("repair_history")
      console.warn("[v0] Could not fetch repair history:", error)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchExpenses = useCallback(async () => {
    if (!currentUser) {
      setExpenses([])
      return
    }
    if (isTableMissing("expenses")) return

    const supabase = createClient()
    let expensesQuery = withTenantFilter(supabase.from("expenses").select("*"))

    // Los empleados solo deben recibir sus propios gastos. El administrador
    // mantiene la vista consolidada de todo el negocio.
    if (currentUser.role !== "admin" && currentUser.role !== "super_admin") {
      if (currentUser.id && currentUser.name) {
        expensesQuery = expensesQuery.or(`user_id.eq.${currentUser.id},user_name.ilike.${currentUser.name}`)
      } else if (currentUser.id) {
        expensesQuery = expensesQuery.eq("user_id", currentUser.id)
      }
    }

    const { data, error } = await expensesQuery.order("created_at", { ascending: false })

    if (error) {
      markMissingTable("expenses")
      setExpenses([])
      console.warn("[v0] Could not fetch expenses:", error)
      return
    }

    if (data) {
      const formattedExpenses: Expense[] = data.map(mapExpenseFromDB)
      setExpenses(formattedExpenses)
    }
  }, [currentUser?.id, currentUser?.role, isTableMissing, markMissingTable, withTenantFilter])

  const fetchPurchases = useCallback(async () => {
    if (!currentUser) {
      setPurchases([])
      return
    }
    if (isTableMissing("purchases")) return
    const supabase = createClient()
    const { data, error } = await withTenantFilter(
      supabase.from("purchases").select("*"),
    ).order("created_at", { ascending: false })

    if (error) {
      markMissingTable("purchases")
      setPurchases([])
      console.warn("[v0] Could not fetch purchases:", error)
      return
    }

    if (data) {
      const formattedPurchases: Purchase[] = data.map(mapPurchaseFromDB)
      setPurchases(formattedPurchases)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])

  const fetchSupplierPayments = useCallback(async () => {
    if (!currentUser) {
      setSupplierPayments([])
      return
    }
    if (isTableMissing("supplier_payments")) return
    const supabase = createClient()
    const { data, error } = await withTenantFilter(
      supabase.from("supplier_payments").select("*"),
    ).order("created_at", { ascending: false })

    if (error) {
      markMissingTable("supplier_payments")
      setSupplierPayments([])
      console.warn("[v0] Could not fetch supplier payments:", error)
      return
    }

    if (data) {
      const formattedSupplierPayments: SupplierPayment[] = data.map(mapSupplierPaymentFromDB)
      setSupplierPayments(formattedSupplierPayments)
    }
  }, [currentUser?.id, isTableMissing, markMissingTable, withTenantFilter])


  const refreshData = useCallback(async () => {
    if (!currentUser) {
      setEmployees([])
      setSales([])
      setReturns([])
      setPayments([])
      setPaymentAllocations([])
      setProducts([])
      setRepairs([])
      setRepairHistory([])
      setCustomers([])
      setSuppliers([])
      setExpenses([])
      setPurchases([])
      setSupplierPayments([])
      return
    }
    console.log("Refreshing all data...")
    // Supabase puede rechazar streams HTTP/2 cuando demasiadas consultas se
    // abren simultáneamente. Cargamos por grupos pequeños para mantener la
    // conexión estable y evitar ERR_HTTP2_SERVER_REFUSED_STREAM.
    const loaders: Array<() => Promise<void>> = [
      fetchEmployees,
      fetchSales,
      fetchReturns,
      fetchPayments,
      fetchPaymentAllocations,
      fetchProducts,
      fetchRepairs,
      fetchRepairHistory,
      fetchCustomers,
      fetchSuppliers,
      fetchExpenses,
      fetchPurchases,
      fetchSupplierPayments,
    ]

    const batchSize = 6
    for (let index = 0; index < loaders.length; index += batchSize) {
      await Promise.all(loaders.slice(index, index + batchSize).map((load) => load()))
    }
    console.log("Data refresh complete.")
  }, [
    currentUser?.id,
    fetchEmployees,
    fetchSales,
    fetchReturns,
    fetchPayments,
    fetchPaymentAllocations,
    fetchProducts,
    fetchRepairs,
    fetchRepairHistory,
    fetchCustomers,
    fetchSuppliers,
    fetchExpenses,
    fetchPurchases,
    fetchSupplierPayments,
  ])

  const currentUserId = currentUser?.id ?? ""

  // Load data whenever the authenticated user/tenant changes
  useEffect(() => {
    if (currentUserId) {
      void refreshData()
    }
  }, [refreshData, currentUserId])

  // Realtime subscriptions
  useEffect(() => {
    if (!currentUser) return

    const supabase = createClient()
    const channels: RealtimeChannel[] = []
    const subToken = Math.random().toString(36).substring(2, 9)

    try {
      // Employees
      const empChannel = supabase
        .channel(`employees_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "employees" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setEmployees((prev) => {
                if (prev.find((e) => e.id === rec.id)) return prev
                const mapped = mapEmployeeFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setEmployees((prev) => prev.filter((e) => e.id !== rec.id))
                return
              }
              const mapped = mapEmployeeFromDB(rec)
              setEmployees((prev) => prev.map((e) => (e.id === rec.id ? mapped : e)))

              if (currentUser?.id === rec.id) {
                const updatedCurrentUser = {
                  ...currentUser,
                  name: mapped.name,
                  email: mapped.email,
                  permissions: mapped.permissions,
                  role: mapped.role,
                }
                setCurrentUser(updatedCurrentUser)
                try {
                  localStorage.setItem('current_user', JSON.stringify(updatedCurrentUser))
                } catch (err) {
                  console.warn('Unable to persist current_user to localStorage:', err)
                }
              }
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setEmployees((prev) => prev.filter((e) => e.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(empChannel)

      // Products
      const prodChannel = supabase
        .channel(`products_changes_${subToken}`)
        .on(
          "postgres_changes",
            { event: "*", schema: "public", table: "products" },
            (payload: any) => {
              const eventType = payload.eventType
              if (eventType === "INSERT") {
                const rec = payload.new
                if (!isRecordVisibleToCurrentTenant(rec)) return
                const mapped = mapProductFromDB(rec, "products")
                setProducts((prev) => {
                  if (prev.find((p) => p.id === mapped.id)) return prev
                  return [mapped, ...prev]
                })
              } else if (eventType === "UPDATE") {
                const rec = payload.new
                if (!isRecordVisibleToCurrentTenant(rec)) {
                  const mappedId = buildSourceRuntimeId("products", rec.id)
                  setProducts((prev) => prev.filter((p) => p.id !== mappedId))
                  return
                }
                const mapped = mapProductFromDB(rec, "products")
                setProducts((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)))
              } else if (eventType === "DELETE") {
                const rec = payload.old
                if (!isRecordVisibleToCurrentTenant(rec)) return
                const mappedId = buildSourceRuntimeId("products", rec.id)
                setProducts((prev) => prev.filter((p) => p.id !== mappedId))
              }
            },
          )
        .subscribe()
      channels.push(prodChannel)

      if (!isTableMissing("armacen")) {
        const armacenChannel = supabase
          .channel(`armacen_changes_${subToken}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "armacen" },
            (payload: any) => {
              const eventType = payload.eventType
              if (eventType === "INSERT") {
                const rec = payload.new
                if (!isRecordVisibleToCurrentTenant(rec)) return
                const mapped = mapProductFromDB(rec, "armacen")
                setProducts((prev) => {
                  if (prev.find((p) => p.id === mapped.id)) return prev
                  return [mapped, ...prev]
                })
              } else if (eventType === "UPDATE") {
                const rec = payload.new
                if (!isRecordVisibleToCurrentTenant(rec)) {
                  const mappedId = buildSourceRuntimeId("armacen", rec.id)
                  setProducts((prev) => prev.filter((p) => p.id !== mappedId))
                  return
                }
                const mapped = mapProductFromDB(rec, "armacen")
                setProducts((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)))
              } else if (eventType === "DELETE") {
                const rec = payload.old
                if (!isRecordVisibleToCurrentTenant(rec)) return
                const mappedId = buildSourceRuntimeId("armacen", rec.id)
                setProducts((prev) => prev.filter((p) => p.id !== mappedId))
              }
            },
          )
          .subscribe()
        channels.push(armacenChannel)
      }

      // Sales
      const salesChannel = supabase
        .channel(`sales_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSales((prev) => {
                if (prev.find((s) => s.id === rec.id)) return prev
                const mapped = mapSaleFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setSales((prev) => prev.filter((s) => s.id !== rec.id))
                return
              }
              const mapped = mapSaleFromDB(rec)
              setSales((prev) => prev.map((s) => (s.id === rec.id ? mapped : s)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSales((prev) => prev.filter((s) => s.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(salesChannel)

      // Customers
      const custChannel = supabase
        .channel(`customers_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setCustomers((prev) => {
                if (prev.find((c) => c.id === rec.id)) return prev
                const mapped = mapCustomerFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setCustomers((prev) => prev.filter((c) => c.id !== rec.id))
                return
              }
              const mapped = mapCustomerFromDB(rec)
              setCustomers((prev) => prev.map((c) => (c.id === rec.id ? mapped : c)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setCustomers((prev) => prev.filter((c) => c.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(custChannel)

      // Suppliers (simple mapping)
      const supChannel = supabase
        .channel(`suppliers_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "suppliers" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSuppliers((prev) => {
                if (prev.find((s) => s.id === rec.id)) return prev
                const mapped = mapSupplierFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setSuppliers((prev) => prev.filter((s) => s.id !== rec.id))
                return
              }
              const mapped = mapSupplierFromDB(rec)
              setSuppliers((prev) => prev.map((s) => (s.id === rec.id ? mapped : s)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSuppliers((prev) => prev.filter((s) => s.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(supChannel)

      // Canal genérico para medir latencia de INSERT en cualquier tabla (fallback)
      // Comentado por ahora ya que postgres_changes no funciona bien con eventos genéricos
      // const genericChannel = supabase
      //   .channel("all_table_changes")
      //   .on(
      //     "postgres_changes",
      //     { event: "INSERT", schema: "public" },
      //     (payload: any) => {
      //       try {
      //         const rec = payload.new
      //         if (!rec) return
      //         handleRealtimeArrivalLatency(rec)
      //       } catch (err) {
      //         console.error("generic realtime handler error:", err)
      //       }
      //     },
      //   )
      //   .subscribe()
      // channels.push(genericChannel)

      // Returns
      const returnsChannel = supabase
        .channel(`returns_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "returns" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setReturns((prev) => {
                if (prev.find((r) => r.id === rec.id)) return prev
                const mapped = mapReturnFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setReturns((prev) => prev.filter((r) => r.id !== rec.id))
                return
              }
              const mapped = mapReturnFromDB(rec)
              setReturns((prev) => prev.map((r) => (r.id === rec.id ? mapped : r)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setReturns((prev) => prev.filter((r) => r.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(returnsChannel)

      // Repairs (realtime)
      const repairsChannel = supabase
        .channel(`repairs_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "repairs" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setRepairs((prev) => {
                if (prev.find((r) => r.id === rec.id || (rec.repair_number && r.repair_number === rec.repair_number))) return prev
                const mapped = mapRepairFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setRepairs((prev) => prev.filter((r) => r.id !== rec.id))
                return
              }
              const mapped = mapRepairFromDB(rec)
              setRepairs((prev) => prev.map((r) => (r.id === rec.id ? mapped : r)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setRepairs((prev) => prev.filter((r) => r.id !== rec.id))
            }
            broadcastRealtimeTableChange("repairs", payload)
          },
        )
        .subscribe()
      channels.push(repairsChannel)

      // Expenses
      const expensesChannel = supabase
        .channel(`expenses_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              if (currentUser.role !== "admin" && currentUser.role !== "super_admin" && rec.user_id !== currentUser.id) return
              setExpenses((prev) => {
                if (prev.find((e) => e.id === rec.id)) return prev
                const mapped = mapExpenseFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec) ||
                (currentUser.role !== "admin" && currentUser.role !== "super_admin" && rec.user_id !== currentUser.id)) {
                setExpenses((prev) => prev.filter((e) => e.id !== rec.id))
                return
              }
              const mapped = mapExpenseFromDB(rec)
              setExpenses((prev) =>
                prev.map((e) =>
                  e.id === rec.id
                    ? mapped
                    : e,
                ),
              )
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setExpenses((prev) => prev.filter((e) => e.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(expensesChannel)

      // Payments
      const paymentsChannel = supabase
        .channel(`payments_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setPayments((prev) => {
                if (prev.find((p) => p.id === rec.id)) return prev
                const mapped = mapPaymentFromDB(rec)
                return [mapped, ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setPayments((prev) => prev.filter((p) => p.id !== rec.id))
                return
              }
              const mapped = mapPaymentFromDB(rec)
              setPayments((prev) => prev.map((p) => (p.id === rec.id ? mapped : p)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setPayments((prev) => prev.filter((p) => p.id !== rec.id))
            }
          },
        )
        .subscribe()
      channels.push(paymentsChannel)

      // Purchases
      const purchasesChannel = supabase
        .channel(`purchases_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "purchases" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setPurchases((prev) => {
                if (prev.find((p) => p.id === rec.id)) return prev
                return [mapPurchaseFromDB(rec), ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setPurchases((prev) => prev.filter((p) => p.id !== rec.id))
                return
              }
              const mapped = mapPurchaseFromDB(rec)
              setPurchases((prev) => prev.map((p) => (p.id === rec.id ? mapped : p)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setPurchases((prev) => prev.filter((p) => p.id !== rec.id))
            }
            broadcastRealtimeTableChange("purchases", payload)
          },
        )
        .subscribe()
      channels.push(purchasesChannel)

      // Supplier payments
      const supplierPaymentsChannel = supabase
        .channel(`supplier_payments_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "supplier_payments" },
          (payload: any) => {
            const eventType = payload.eventType
            if (eventType === "INSERT") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSupplierPayments((prev) => {
                if (prev.find((p) => p.id === rec.id)) return prev
                return [mapSupplierPaymentFromDB(rec), ...prev]
              })
            } else if (eventType === "UPDATE") {
              const rec = payload.new
              if (!isRecordVisibleToCurrentTenant(rec)) {
                setSupplierPayments((prev) => prev.filter((p) => p.id !== rec.id))
                return
              }
              const mapped = mapSupplierPaymentFromDB(rec)
              setSupplierPayments((prev) => prev.map((p) => (p.id === rec.id ? mapped : p)))
            } else if (eventType === "DELETE") {
              const rec = payload.old
              if (!isRecordVisibleToCurrentTenant(rec)) return
              setSupplierPayments((prev) => prev.filter((p) => p.id !== rec.id))
            }
            broadcastRealtimeTableChange("supplier_payments", payload)
          },
        )
        .subscribe()
      channels.push(supplierPaymentsChannel)

      // Cash closings (la pagina cierre-de-caja escucha el broadcast)
      const cashClosingsChannel = supabase
        .channel(`cash_closings_changes_${subToken}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cash_closings" },
          (payload: any) => {
            const rec = payload.new ?? payload.old
            if (rec && !isRecordVisibleToCurrentTenant(rec)) return
            broadcastRealtimeTableChange("cash_closings", payload)
          },
        )
        .subscribe()
      channels.push(cashClosingsChannel)

      const broadcastTables = [
        "almacen_closings",
        "almacen_customer_accounts",
        "almacen_credit_sales",
        "almacen_payments",
        "detalle_costos_ventas",
      ] as const

      for (const table of broadcastTables) {
        const ch = supabase
          .channel(`${table}_broadcast_${subToken}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            (payload: any) => {
              const rec = payload.new ?? payload.old
              if (rec && !isRecordVisibleToCurrentTenant(rec)) return
              broadcastRealtimeTableChange(table, payload)
            },
          )
          .subscribe()
        channels.push(ch)
      }
    } catch (err) {
      console.error("Error setting up realtime channels:", err)
    }

    return () => {
      // Cleanup de suscripciones
      try {
        channels.forEach((ch) => {
          if (ch && typeof ch.unsubscribe === "function") ch.unsubscribe()
        })
      } catch (err) {
        console.error("Error unsubscribing realtime channels:", err)
      }
    }
  }, [currentUser, isRecordVisibleToCurrentTenant, isTableMissing])

  const getCurrentEmployeePermissions = useCallback(() => {
    if (!currentUser || currentUser.role === "admin") return undefined
    const currentEmail = currentUser.email.trim().toLowerCase()
    const employee = employees.find((item) => {
      const itemEmail = item.email.trim().toLowerCase()
      return item.id === currentUser.id || itemEmail === currentEmail
    })
    return employee?.permissions ?? currentUser.permissions
  }, [currentUser, employees])

  const canCurrentUserPerform = useCallback((permission: EmployeeCrudPermission) => {
    if (internalCrudBypassRef.current > 0) return true
    if (!currentUser) return false
    if (currentUser.role === "admin") return true
    return Boolean(getCurrentEmployeePermissions()?.[permission])
  }, [currentUser, getCurrentEmployeePermissions])

  const runWithInternalCrudBypass = async <T,>(operation: () => Promise<T>): Promise<T> => {
    internalCrudBypassRef.current += 1
    try {
      return await operation()
    } finally {
      internalCrudBypassRef.current = Math.max(0, internalCrudBypassRef.current - 1)
    }
  }

  const notifyCrudPermissionDenied = useCallback(
    (actionLabel: string, resourceLabel: string) => {
      toast({
        title: "Sin permiso",
        description: `Tu usuario no tiene permiso para ${actionLabel} ${resourceLabel}.`,
        variant: "destructive",
      })
    },
    [toast],
  )

  const notifyAddPermissionDenied = useCallback(
    (resourceLabel: string) => notifyCrudPermissionDenied("agregar", resourceLabel),
    [notifyCrudPermissionDenied],
  )

  const addProduct = async (product: Omit<Product, "id">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("productos")
      return
    }

    const tempId = generateUUID()
    const targetTable = getInventoryTableName(product)
    const runtimeId = buildSourceRuntimeId(targetTable, tempId)
    const newProduct: Product = {
      ...product,
      id: runtimeId,
      sourceTable: targetTable,
      sourceId: tempId,
      boxNumber: product.boxNumber || undefined,
      buyPrice: product.buyPrice,
      wholesalePrice: product.wholesalePrice,
      sellPrice: product.sellPrice,
      supplier: product.supplier || "",
      capacity: product.capacity || undefined,
      imei: product.imei || undefined,
    }

    // 1. Optimistic update
    setProducts((prev) => [newProduct, ...prev])

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from(targetTable)
        .insert(
          withTenantPayload(
            targetTable === "armacen"
              ? {
                  id: tempId,
                  sku: product.sku,
                  name: product.name,
                  category: product.category,
                  image_url: product.imageUrl || null,
                  box_number: product.boxNumber || null,
                  stock: product.stock,
                  min_stock: product.minStock,
                  buy_price: product.buyPrice,
                  sell_price: product.sellPrice,
                  supplier: product.supplier || "",
                  capacity: product.capacity || null,
                  imei: product.imei || null,
                }
              : {
                  id: tempId,
                  sku: product.sku,
                  name: product.name,
                  category: product.category,
                  image_url: product.imageUrl || null,
                  stock: product.stock,
                  min_stock: product.minStock,
                  buy_price: product.buyPrice,
                  wholesale_price: product.wholesalePrice,
                  sell_price: product.sellPrice,
                  supplier: product.supplier || "",
                  capacity: product.capacity || null,
                  imei: product.imei || null,
              },
          ),
        )
        .select()
        .single()

      if (error) {
        console.error("[v0] Error adding product:", error)
        // Rollback
        setProducts((prev) => prev.filter((p) => p.id !== runtimeId))
        throw error
      }

      if (data) {
        markPendingLocalWrite(String(data.id ?? tempId))
        setProducts((prev) => prev.map((p) => (p.id === runtimeId ? mapProductFromDB(data, targetTable) : p)))
      }
    } catch (error) {
      console.error("Error adding product:", error)
      throw error
    }
  }

  const updateProduct = async (id: string, product: Partial<Product>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "productos")
      return
    }

    const previousProducts = [...products]
    const currentProduct = products.find((entry) => entry.id === id)
    const targetTable = resolveInventoryTableById(id, product)
    const dbProductId = currentProduct?.sourceId || parseSourceRuntimeId(id)?.sourceId || id

    // Optimistic update
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...product } : p)))

    try {
      const supabase = createClient()
      const updateData: any = {}

      if (product.sku !== undefined) updateData.sku = product.sku
      if (product.name !== undefined) updateData.name = product.name
      if (product.imageUrl !== undefined) updateData.image_url = product.imageUrl || null
      if (product.category !== undefined) updateData.category = product.category
      if (product.stock !== undefined) updateData.stock = product.stock
      if (product.minStock !== undefined) updateData.min_stock = product.minStock
      if (product.buyPrice !== undefined) updateData.buy_price = product.buyPrice
      if (targetTable === "products" && product.wholesalePrice !== undefined) updateData.wholesale_price = product.wholesalePrice
      if (product.sellPrice !== undefined) updateData.sell_price = product.sellPrice
      if (product.supplier !== undefined) updateData.supplier = product.supplier
      if (product.capacity !== undefined) updateData.capacity = product.capacity
      if (product.imei !== undefined) updateData.imei = product.imei
      if (targetTable === "armacen" && product.boxNumber !== undefined) {
        updateData.box_number = product.boxNumber || null
      }

      const { error } = await withTenantFilter(
        supabase.from(targetTable).update(updateData),
      ).eq("id", dbProductId)

      if (error) {
        console.error("Error updating product:", error)
        setProducts(previousProducts)
        throw error
      }
    } catch (error) {
      console.error("Error updating product:", error)
      setProducts(previousProducts)
    }
  }

  const deleteProduct = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "productos")
      return
    }

    const previousProducts = [...products]
    const targetTable = resolveInventoryTableById(id)
    const dbProductId = products.find((product) => product.id === id)?.sourceId || parseSourceRuntimeId(id)?.sourceId || id

    // Optimistic delete
    setProducts((prev) => prev.filter((p) => p.id !== id))

    try {
      const supabase = createClient()
      const { error } = await withTenantFilter(supabase.from(targetTable).delete()).eq("id", dbProductId)

      if (error) {
        console.error("Error deleting product:", error)
        setProducts(previousProducts)
        throw error
      }
    } catch (error) {
      console.error("Error deleting product:", error)
      setProducts(previousProducts)
    }
  }

  const resolveInventoryTableById = (id: string, fallbackProduct?: Partial<Product>): InventoryTableName => {
    const currentProduct = products.find((product) => product.id === id)
    const parsedRuntimeId = parseSourceRuntimeId(id)
    return (
      normalizeInventorySourceTable(currentProduct?.sourceTable) ||
      normalizeInventorySourceTable(fallbackProduct?.sourceTable) ||
      normalizeInventorySourceTable(parsedRuntimeId?.sourceTable) ||
      getInventoryTableName(currentProduct || fallbackProduct)
    )
  }

  const generateInvoiceNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0")
    return `INV-${year}${month}-${random}`
  }

  const generatePurchaseNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0")
    return `OC-${year}${month}-${random}`
  }

  const generateReturnNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0")
    return `DEV-${year}${month}-${random}`
  }

  // Genera un ID de ticket con formato TIC-###### y verifica unicidad en la tabla repairs
  const generateTicketId = async (supabase: any) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const num = Math.floor(Math.random() * 1000000).toString().padStart(6, "0")
      const candidate = `TIC-${num}`
      try {
        const { data, error } = await withTenantFilter(
          supabase.from("repairs").select("id"),
        ).eq("repair_number", candidate).limit(1)
        if (error) {
          console.error("Error checking ticket id uniqueness:", error)
          // si hay error, no abortamos inmediatamente; intentamos otra vez
          continue
        }
        if (!data || data.length === 0) return candidate
      } catch (err) {
        console.error("Unexpected error when checking ticket id:", err)
        continue
      }
    }
    // Fallback: usar timestamp si no se consiguió unicidad
    return `TIC-${Date.now().toString().slice(-6)}`
  }

  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100

  const isInventorySource = (sourceTable?: SaleItemSource | null): sourceTable is InventorySourceTable =>
    sourceTable === "products" || sourceTable === "armacen"

  const normalizeCartItemForPersistence = (
    item: Partial<CartItem>,
    fallbackSource?: SaleItemSource | null,
  ): CartItem => {
    const resolvedSource = resolveSaleItemSource(item, fallbackSource) ?? resolveSaleItemSource(item, "products")
    if (!resolvedSource) {
      throw new Error(`No se pudo determinar el origen del producto "${item.name || item.id || "sin id"}".`)
    }

    const quantity = Math.max(0, Number(item.quantity) || 0)
    const stock = Number(item.stock)
    const minStock = Number(item.minStock)
    const buyPrice = Number(item.buyPrice)
    const wholesalePrice = Number(item.wholesalePrice)
    const sellPrice = Number(item.sellPrice ?? item.customPrice ?? 0)
    const customPrice = Number(item.customPrice)

    return {
      id: normalizeRuntimeItemId(item as Record<string, unknown>, resolvedSource.sourceTable),
      cartId:
        typeof item.cartId === "string" && item.cartId.trim().length > 0
          ? item.cartId
          : `${resolvedSource.runtimeId}-${Math.random().toString(36).slice(2, 8)}`,
      sourceTable: resolvedSource.sourceTable,
      sourceId: resolvedSource.sourceId,
      sku: typeof item.sku === "string" ? item.sku : "",
      name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name : "Producto",
      category: typeof item.category === "string" ? item.category : "",
      boxNumber: item.boxNumber == null ? undefined : String(item.boxNumber),
      stock: Number.isFinite(stock) ? stock : 0,
      minStock: Number.isFinite(minStock) ? minStock : 0,
      buyPrice: Number.isFinite(buyPrice) ? buyPrice : 0,
      wholesalePrice: Number.isFinite(wholesalePrice) ? wholesalePrice : 0,
      sellPrice: Number.isFinite(sellPrice) ? sellPrice : 0,
      supplier: typeof item.supplier === "string" ? item.supplier : "",
      capacity: item.capacity == null ? undefined : String(item.capacity),
      imei: item.imei == null ? undefined : String(item.imei),
      quantity: quantity > 0 ? quantity : 1,
      customPrice: Number.isFinite(customPrice) && customPrice >= 0 ? customPrice : undefined,
      dbId: item.dbId,
    }
  }

  const normalizeCartItemsForPersistence = (
    items: Array<Partial<CartItem>>,
    fallbackSource?: SaleItemSource | null,
  ) => items.map((item) => normalizeCartItemForPersistence(item, fallbackSource))

  const normalizeReturnItemForPersistence = (item: Partial<ReturnItem>): ReturnItem => {
    const resolvedSource = resolveSaleItemSource(item, item.sourceTable)
    if (!resolvedSource) {
      throw new Error(`No se pudo determinar el origen de la devolucion para "${item.productName || item.id || "sin id"}".`)
    }

    const quantity = Math.max(0, Number(item.quantity) || 0)
    const unitPrice = Number(item.unitPrice)
    const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
    const buyPrice = Number(item.buyPrice)
    const subtotal = Number(item.subtotal)

    return {
      id:
        typeof item.id === "string" && item.id.trim().length > 0
          ? item.id
          : `${resolvedSource.runtimeId}-return-${Math.random().toString(36).slice(2, 8)}`,
      productId: normalizeRuntimeItemId(item as Record<string, unknown>, resolvedSource.sourceTable),
      sourceTable: resolvedSource.sourceTable,
      sourceId: resolvedSource.sourceId,
      productName: typeof item.productName === "string" && item.productName.trim().length > 0 ? item.productName : "Producto",
      imei: item.imei == null ? undefined : String(item.imei),
      quantity,
      unitPrice: safeUnitPrice,
      buyPrice: Number.isFinite(buyPrice) ? Math.max(0, buyPrice) : undefined,
      subtotal: Number.isFinite(subtotal) ? subtotal : safeUnitPrice * quantity,
      accountingVersion: item.accountingVersion === 2 ? 2 : undefined,
    }
  }

  const updateLocalStockForItems = (items: Array<Partial<CartItem | ReturnItem>>, deltaMultiplier: 1 | -1) => {
    items.forEach((item) => {
      try {
        const resolvedSource = resolveSaleItemSource(item, (item as CartItem).sourceTable)
        console.debug("[stock][local] resolving item:", item, "=>", resolvedSource)
        if (!resolvedSource || !isInventorySource(resolvedSource.sourceTable)) return
        const runtimeId = buildSourceRuntimeId(resolvedSource.sourceTable, resolvedSource.sourceId)
        const quantity = Math.max(0, Number(item.quantity) || 0)

        console.debug(`[stock][local] updating product runtimeId=${runtimeId} quantity=${quantity} delta=${deltaMultiplier}`)

        setProducts((prev) =>
          prev.map((product) =>
            product.id === runtimeId
              ? { ...product, stock: Math.max(0, product.stock + quantity * deltaMultiplier) }
              : product,
          ),
        )
      } catch (err) {
        console.error("[stock][local] error resolving/updating item:", item, err)
      }
    })
  }

  const updateDbStockForItems = async (
    supabase: ReturnType<typeof createClient>,
    items: Array<Partial<CartItem | ReturnItem>>,
    deltaMultiplier: 1 | -1,
  ) => {
    await Promise.all(
      items.map(async (item) => {
        const resolvedSource = resolveSaleItemSource(item, (item as CartItem).sourceTable)
        if (!resolvedSource || !isInventorySource(resolvedSource.sourceTable)) {
          console.debug("[stock][db] skipping non-inventory or unresolved item:", item, resolvedSource)
          return
        }

        const product = products.find(
          (entry) => entry.sourceTable === resolvedSource.sourceTable && entry.sourceId === resolvedSource.sourceId,
        )
        if (!product) return

        const quantity = Math.max(0, Number(item.quantity) || 0)
        const nextStock = Math.max(0, product.stock + quantity * deltaMultiplier)

        try {
          console.debug(`[stock][db] updating table=${resolvedSource.sourceTable} id=${resolvedSource.sourceId} nextStock=${nextStock}`)
          await withTenantFilter(
            supabase.from(resolvedSource.sourceTable).update({ stock: nextStock }),
          ).eq("id", resolvedSource.sourceId)
        } catch (err) {
          console.error("[stock][db] error updating stock for item:", item, resolvedSource, err)
        }
      }),
    )
  }


  const getSalePaymentBreakdown = (saleTotal: number, amountPaid: number, paymentMethod?: string) => {
    const normalizedTotal = Math.max(0, Number(saleTotal) || 0)
    const normalizedAmountPaid = Math.min(normalizedTotal, Math.max(0, Number(amountPaid) || 0))
    const normalizedMethod = normalizePaymentMethod(paymentMethod)

    const breakdown = {
      cash: 0,
      card: 0,
      transfer: 0,
      credit: 0,
      method: normalizedMethod,
    }

    if (normalizedTotal <= 0) return breakdown

    if (normalizedMethod === "credit") {
      breakdown.credit = normalizedTotal
      return breakdown
    }

    const isPartialCredit = normalizedAmountPaid > 0 && normalizedAmountPaid < normalizedTotal
    if (isPartialCredit) {
      breakdown[normalizedMethod] = normalizedAmountPaid
      breakdown.credit = normalizedTotal - normalizedAmountPaid
      return breakdown
    }

    breakdown[normalizedMethod] = normalizedTotal
    return breakdown
  }

  const buildSalePaymentBreakdownEntries = (saleData: Pick<Sale, "total" | "amountPaid" | "paymentMethod">) => {
    const breakdown = getSalePaymentBreakdown(saleData.total, saleData.amountPaid, saleData.paymentMethod)
    return (Object.entries(breakdown) as Array<[keyof typeof breakdown, number | PaymentMethod]>)
      .filter(([key]) => key !== "method")
      .map(([method, amount]) => ({
        method: method as PaymentMethod,
        amount: roundMoney(Number(amount) || 0),
      }))
      .filter((entry) => entry.amount > 0)
  }

  const buildSaleInsertPayload = (sale: Sale) =>
    withTenantPayload({
      id: sale.id,
      invoice_number: sale.invoiceNumber,
      date: sale.date,
      items: sale.items,
      subtotal: sale.subtotal || 0,
      tax: sale.tax || 0,
      total: sale.total,
      amount_paid: sale.amountPaid,
      change: sale.change,
      payment_method: sale.paymentMethod,
      payment_breakdown: buildSalePaymentBreakdownEntries(sale),
      customer_name: sale.customerName,
      customer_phone: sale.customerPhone,
      customer_id: sale.customerId,
      almacen_customer_account_id: sale.almacenCustomerAccountId ?? null,
      almacen_customer_name: sale.almacenCustomerName ?? null,
      almacen_customer_phone: sale.almacenCustomerPhone ?? null,
      almacen_source_customer_id: sale.almacenSourceCustomerId ?? null,
      status: sale.status,
      credit_resolved: sale.creditResolved ?? false,
      is_wholesale: sale.isWholesale ?? false,
      created_by_employee_id: sale.createdByEmployeeId || currentUser?.id || null,
    })

  const stripUnsupportedSaleInsertColumns = (payload: Record<string, unknown>) => {
    const nextPayload = { ...payload }
    delete nextPayload.payment_breakdown
    delete nextPayload.almacen_customer_account_id
    delete nextPayload.almacen_customer_name
    delete nextPayload.almacen_customer_phone
    delete nextPayload.almacen_source_customer_id
    delete nextPayload.credit_resolved
    return nextPayload
  }

  const insertSaleRecord = async (
    supabase: ReturnType<typeof createClient>,
    sale: Sale,
    selectSingle = false,
  ) => {
    const payload = buildSaleInsertPayload(sale)
    let query = supabase.from("sales").insert(payload)

    if (selectSingle) {
      const result = await query.select().single()
      if (
        result.error &&
        [
          "payment_breakdown",
          "almacen_customer_account_id",
          "almacen_customer_name",
          "almacen_customer_phone",
          "almacen_source_customer_id",
          "credit_resolved",
        ].some((column) => isMissingColumnError(result.error, column))
      ) {
        return supabase.from("sales").insert(stripUnsupportedSaleInsertColumns(payload)).select().single()
      }
      return result
    }

    let result = await query
    if (
      result.error &&
      [
        "payment_breakdown",
        "almacen_customer_account_id",
        "almacen_customer_name",
        "almacen_customer_phone",
        "almacen_source_customer_id",
      ].some((column) => isMissingColumnError(result.error, column))
    ) {
      result = await supabase.from("sales").insert(stripUnsupportedSaleInsertColumns(payload))
    }

    return result
  }

  const syncAlmacenCreditLedger = async (sale: Sale, supabase: ReturnType<typeof createClient>) => {
    try {
      type AlmacenAccountRow = {
        id: string
        source_customer_id?: string | null
        debt?: number
        total_purchases?: number
        phone?: string | null
        cedula?: string | null
        email?: string | null
        address?: string | null
      }

      const saleItems = Array.isArray(sale.items) ? sale.items : []
      if (saleItems.length === 0) return

      const isAlmacenSaleItem = (item: Partial<CartItem>) => isAlmacenSourceRecord(item as Record<string, unknown>)

      const getLineSubtotal = (item: Partial<CartItem>) => {
        const quantity = Math.max(0, Number(item.quantity) || 0)
        const unitPrice = Number(item.customPrice ?? item.sellPrice ?? 0)
        return Math.max(0, quantity * (Number.isFinite(unitPrice) ? unitPrice : 0))
      }

      let saleItemsTotal = 0
      let almacenItemsTotal = 0
      let almacenItemsCount = 0
      let nonAlmacenItemsCount = 0

      saleItems.forEach((item) => {
        const lineSubtotal = getLineSubtotal(item)
        saleItemsTotal += lineSubtotal

        if (isAlmacenSaleItem(item)) {
          almacenItemsTotal += lineSubtotal
          almacenItemsCount += 1
        } else {
          nonAlmacenItemsCount += 1
        }
      })

      const almacenRatio =
        saleItemsTotal > 0
          ? Math.max(0, Math.min(1, almacenItemsTotal / saleItemsTotal))
          : almacenItemsCount > 0 && nonAlmacenItemsCount === 0
            ? 1
            : 0

      if (almacenRatio <= 0) return

      const totalBreakdown = getSalePaymentBreakdown(sale.total, sale.amountPaid, sale.paymentMethod)
      const almacenBreakdown = {
        cash: totalBreakdown.cash * almacenRatio,
        card: totalBreakdown.card * almacenRatio,
        transfer: totalBreakdown.transfer * almacenRatio,
        credit: totalBreakdown.credit * almacenRatio,
      }

      const almacenTotal = roundMoney(
        almacenBreakdown.cash + almacenBreakdown.card + almacenBreakdown.transfer + almacenBreakdown.credit,
      )
      const almacenPaid = roundMoney(almacenBreakdown.cash + almacenBreakdown.card + almacenBreakdown.transfer)
      const almacenCreditAmount = roundMoney(almacenBreakdown.credit)

      // Solo registramos en cliente-almacen cuando existe deuda de almacen.
      if (almacenCreditAmount <= 0) return

      const explicitAlmacenAccountId = String((sale as any).almacenCustomerAccountId || "").trim()
      const explicitAlmacenCustomerName = String((sale as any).almacenCustomerName || "").trim()
      const explicitAlmacenCustomerPhone = String((sale as any).almacenCustomerPhone || "").trim()
      const explicitAlmacenSourceCustomerRaw = (sale as any).almacenSourceCustomerId
      const explicitAlmacenSourceCustomerId =
        explicitAlmacenSourceCustomerRaw === undefined || explicitAlmacenSourceCustomerRaw === null
          ? null
          : String(explicitAlmacenSourceCustomerRaw).trim() || null

      const sourceCustomer = sale.customerId ? customers.find((customer) => customer.id === sale.customerId) : undefined
      const resolvedSourceCustomerId = explicitAlmacenSourceCustomerId || sale.customerId || sourceCustomer?.id || null
      const fallbackName = explicitAlmacenCustomerName || sale.customerName || sourceCustomer?.name || "Cliente de almacen"
      const fallbackPhone = explicitAlmacenCustomerPhone || sale.customerPhone || sourceCustomer?.phone || null

      let account: AlmacenAccountRow | null = null

      if (explicitAlmacenAccountId) {
        const { data, error } = await withTenantFilter(
          supabase.from("almacen_customer_accounts").select("*"),
        ).eq("id", explicitAlmacenAccountId).maybeSingle()

        if (error) {
          if (isMissingTableError(error)) return
          throw error
        }

        account = (data as AlmacenAccountRow | null) || null
      }

      if (!account && resolvedSourceCustomerId) {
        const { data, error } = await withTenantFilter(
          supabase.from("almacen_customer_accounts").select("*"),
        ).eq("source_customer_id", resolvedSourceCustomerId).maybeSingle()

        if (error) {
          if (isMissingTableError(error)) return
          throw error
        }

        account = (data as AlmacenAccountRow | null) || null
      }

      if (!account) {
        const { data, error } = await withTenantFilter(
          supabase.from("almacen_customer_accounts").select("*"),
        ).ilike("name", fallbackName).limit(1).maybeSingle()

        if (error) {
          if (isMissingTableError(error)) return
          throw error
        }

        account = (data as AlmacenAccountRow | null) || null
      }

      if (!account) {
        const { data, error } = await supabase
          .from("almacen_customer_accounts")
          .insert(
            withTenantPayload({
              source_customer_id: resolvedSourceCustomerId,
              name: fallbackName,
              cedula: sourceCustomer?.cedula || null,
              phone: fallbackPhone,
              email: sourceCustomer?.email || null,
              address: sourceCustomer?.address || null,
              notes: sourceCustomer?.notes || null,
              debt: 0,
              total_purchases: 0,
              credit_limit: Number(sourceCustomer?.creditLimit) || 0,
              status: "En proceso",
            }),
          )
          .select("*")
          .single()

        if (error) {
          if (isMissingTableError(error)) return
          throw error
        }

        account = (data as AlmacenAccountRow | null) || null
      } else {
        await withTenantFilter(
          supabase.from("almacen_customer_accounts").update({
            source_customer_id: account.source_customer_id || resolvedSourceCustomerId,
            name: fallbackName,
            phone: fallbackPhone || account.phone || null,
            cedula: sourceCustomer?.cedula || account.cedula || null,
            email: sourceCustomer?.email || account.email || null,
            address: sourceCustomer?.address || account.address || null,
          }),
        ).eq("id", account.id)
      }

      const almacenItems = saleItems.filter((item) => isAlmacenSaleItem(item))

      const { error: ledgerError } = await supabase.from("almacen_credit_sales").insert(
        withTenantPayload({
          sale_id: sale.id,
          invoice_number: sale.invoiceNumber,
          date: sale.date,
          customer_account_id: account.id,
          customer_name: fallbackName,
          items: almacenItems,
          total: almacenTotal,
          amount_paid: almacenPaid,
          credit_amount: almacenCreditAmount,
          payment_method: totalBreakdown.method,
          status: "credito",
          notes: "Generado automaticamente desde /ventas",
        }),
      )

      if (ledgerError) {
        if (isMissingTableError(ledgerError)) return
        throw ledgerError
      }

      const currentDebt = Number(account.debt) || 0
      const currentPurchases = Number(account.total_purchases) || 0
      const nextDebt = roundMoney(currentDebt + almacenCreditAmount)
      const nextTotalPurchases = roundMoney(currentPurchases + almacenTotal)

      const { error: accountUpdateError } = await withTenantFilter(
        supabase.from("almacen_customer_accounts").update({
          debt: nextDebt,
          total_purchases: nextTotalPurchases,
          status: nextDebt > 0 ? "En proceso" : "Finalizado",
        }),
      ).eq("id", account.id)

      if (accountUpdateError && !isMissingTableError(accountUpdateError)) {
        throw accountUpdateError
      }
    } catch (error) {
      console.error("Error syncing almacen credit ledger:", error)
    }
  }

  const assertProductsExistInArmacen = async (
    supabase: ReturnType<typeof createClient>,
    productIds: string[],
  ): Promise<Array<{ id: string; stock: number }>> => {
    const uniqueIds = [...new Set(productIds.map((id) => String(id || "").trim()).filter(Boolean))]
    if (uniqueIds.length === 0) return []

    const { data, error } = await withTenantFilter(
      supabase.from("armacen").select("id, stock"),
    ).in("id", uniqueIds)
    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("La tabla armacen no existe o no es accesible.")
      }
      throw error
    }

    const rows = (data || []).map((row: any) => ({
      id: String(row.id),
      stock: Number(row.stock) || 0,
    }))

    const foundIds = new Set(rows.map((row) => row.id))
    const missingIds = uniqueIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      throw new Error(`Productos invalidos para Cliente Almacen (no existen en armacen): ${missingIds.join(", ")}`)
    }

    return rows
  }

  const upsertAlmacenCustomerAccount = async ({
    supabase,
    sourceCustomerId,
    name,
    phone,
  }: {
    supabase: ReturnType<typeof createClient>
    sourceCustomerId?: string | null
    name: string
    phone?: string
  }) => {
    const normalizedName = String(name || "").trim()
    if (!normalizedName) {
      throw new Error("Nombre de cliente requerido para venta a credito de almacen.")
    }

    const sourceId = sourceCustomerId ? String(sourceCustomerId).trim() : ""
    const sourceCustomer = sourceId ? customers.find((customer) => customer.id === sourceId) : undefined

    if (sourceId) {
      const { data, error } = await withTenantFilter(
        supabase.from("almacen_customer_accounts").select("*"),
      ).eq("source_customer_id", sourceId).maybeSingle()

      if (error) {
        if (isMissingTableError(error)) {
          throw new Error("La tabla almacen_customer_accounts no existe o no es accesible.")
        }
        throw error
      }

      if (data) return data as any
    }

    // Fallback: intentar matchear por nombre (y telefono si existe) para evitar duplicados.
    const baseQuery = withTenantFilter(
      supabase.from("almacen_customer_accounts").select("*"),
    ).ilike("name", normalizedName).limit(1)
    const { data: foundByName, error: findError } = phone
      ? await baseQuery.eq("phone", String(phone)).maybeSingle()
      : await baseQuery.maybeSingle()

    if (findError) {
      if (isMissingTableError(findError)) {
        throw new Error("La tabla almacen_customer_accounts no existe o no es accesible.")
      }
      throw findError
    }

    if (foundByName) {
      const { data: updated, error: updateError } = await withTenantFilter(
        supabase.from("almacen_customer_accounts").update({
          source_customer_id: (foundByName as any).source_customer_id || (sourceId || null),
          name: normalizedName,
          phone: phone || sourceCustomer?.phone || (foundByName as any).phone || null,
          cedula: sourceCustomer?.cedula || (foundByName as any).cedula || null,
          email: sourceCustomer?.email || (foundByName as any).email || null,
          address: sourceCustomer?.address || (foundByName as any).address || null,
        }),
      ).eq("id", (foundByName as any).id).select("*").single()

      if (updateError) {
        if (isMissingTableError(updateError)) {
          throw new Error("La tabla almacen_customer_accounts no existe o no es accesible.")
        }
        throw updateError
      }

      return updated as any
    }

    const { data: inserted, error: insertError } = await supabase
      .from("almacen_customer_accounts")
      .insert(
        withTenantPayload({
          source_customer_id: sourceId || null,
          name: normalizedName,
          cedula: sourceCustomer?.cedula || null,
          phone: phone || sourceCustomer?.phone || null,
          email: sourceCustomer?.email || null,
          address: sourceCustomer?.address || null,
          notes: sourceCustomer?.notes || null,
          debt: 0,
          total_purchases: 0,
          credit_limit: Number(sourceCustomer?.creditLimit) || 0,
          status: "En proceso",
        }),
      )
      .select("*")
      .single()

    if (insertError) {
      if (isMissingTableError(insertError)) {
        throw new Error("La tabla almacen_customer_accounts no existe o no es accesible.")
      }
      throw insertError
    }

    return inserted as any
  }

  const createAlmacenSale: StoreContextType["createAlmacenSale"] = async (params) => {
    const items = Array.isArray(params.items) ? params.items : []
    if (items.length === 0) return { success: false, error: new Error("Agrega productos antes de guardar la venta.") }

    const supabase = createClient()

    try {
      const normalizedItems = normalizeCartItemsForPersistence(items, "armacen")
      const invalidSources = normalizedItems.filter((item) => item.sourceTable !== "armacen")
      if (invalidSources.length > 0) {
        throw new Error("La venta de Cliente Almacen solo puede incluir productos de la tabla armacen.")
      }

      // 1) Validacion estricta: los IDs deben existir en public.armacen
      const productIds = normalizedItems.map((item) => item.sourceId)
      const armacenRows = await assertProductsExistInArmacen(supabase, productIds)
      const stockById = new Map(armacenRows.map((row) => [row.id, row.stock]))

      // 2) Validar stock en armacen
      const insufficient = normalizedItems
        .map((item) => {
          const available = stockById.get(item.sourceId) ?? 0
          const quantity = Math.max(0, Number(item.quantity) || 0)
          return { item, available, quantity }
        })
        .filter((entry) => entry.quantity > entry.available)

      if (insufficient.length > 0) {
        const names = insufficient.map((entry) => `${entry.item.name} (stock: ${entry.available})`).join(", ")
        throw new Error(`Inventario insuficiente en almacen: ${names}`)
      }

      const total = roundMoney(
        items.reduce((sum, item) => {
          const unitPrice = Number(item.customPrice ?? item.sellPrice ?? 0)
          const quantity = Math.max(0, Number(item.quantity) || 0)
          const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
          return sum + safeUnitPrice * quantity
        }, 0),
      )

      const normalizedPaidInput = Math.max(0, Number(params.amountPaid) || 0)
      const amountPaid =
        params.paymentMethod === "credit" ? 0 : Math.min(total, normalizedPaidInput)
      const creditAmount =
        params.paymentMethod === "credit" ? total : roundMoney(Math.max(0, total - amountPaid))
      const change = roundMoney(Math.max(0, amountPaid - total))

      const sale: Sale = {
        id: generateUUID(),
        invoiceNumber: generateInvoiceNumber(),
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        items: normalizedItems.map((item) => ({ ...item })),
        total,
        amountPaid,
        change,
        paymentMethod: normalizePaymentMethod(params.paymentMethod),
        customerName: params.customerName || undefined,
        customerPhone: params.customerPhone || undefined,
        customerId: undefined,
        almacenSourceCustomerId: params.sourceCustomerId ?? null,
        status: creditAmount > 0 ? "credito" : "completada",
        createdByEmployeeId: currentUser?.id ?? undefined,
      }

      // 3) Optimistic: sales + stock local
      setSales((prev) => {
        if (prev.find((s) => s.id === sale.id)) return prev
        return [sale, ...prev]
      })

      try {
        updateLocalStockForItems(sale.items, -1)
      } catch (err) {
        console.error("Error updating stock optimistically (cliente-almacen):", err)
      }

      // 4) Insertar en sales
      markPendingLocalWrite(sale.id)
      const { error: saleError } = await insertSaleRecord(supabase, sale)

      if (saleError) {
        setSales((prev) => prev.filter((s) => s.id !== sale.id))
        updateLocalStockForItems(sale.items, 1)
        throw saleError
      }

      // 5) Actualizar stock en armacen (estricto)
      await Promise.all(
        sale.items.map(async (soldItem) => {
          const available = stockById.get(soldItem.sourceId) ?? 0
          const quantity = Math.max(0, Number(soldItem.quantity) || 0)
          const newStock = Math.max(0, available - quantity)
          const { error: stockError } = await withTenantFilter(
            supabase.from("armacen").update({ stock: newStock }),
          ).eq("id", soldItem.sourceId)
          if (stockError) {
            console.error("Error updating armacen stock:", stockError)
          }
        }),
      )

      // 6) Solo si hay credito: crear/actualizar cuenta + insertar en almacen_credit_sales + sumar debt
      if (creditAmount > 0) {
        const account = await upsertAlmacenCustomerAccount({
          supabase,
          sourceCustomerId: params.sourceCustomerId || null,
          name: params.customerName || "",
          phone: params.customerPhone || "",
        })

        const currentDebt = Number((account as any)?.debt) || 0
        const currentPurchases = Number((account as any)?.total_purchases) || 0
        const nextDebt = roundMoney(currentDebt + creditAmount)
        const nextTotalPurchases = roundMoney(currentPurchases + total)

        const { error: creditSaleError } = await supabase.from("almacen_credit_sales").insert(
          withTenantPayload({
            sale_id: sale.id,
            invoice_number: sale.invoiceNumber,
            date: sale.date,
            customer_account_id: (account as any).id,
            customer_name: params.customerName || (account as any).name || null,
            items: sale.items,
            total: total,
            amount_paid: amountPaid,
            credit_amount: creditAmount,
            payment_method: params.paymentMethod,
            status: "credito",
            notes: "Generado desde /cliente-almacen",
          }),
        )

        if (creditSaleError) {
          if (!isMissingTableError(creditSaleError)) {
            console.error("Error inserting almacen_credit_sales:", creditSaleError)
          }
        }

        const { error: accountUpdateError } = await withTenantFilter(
          supabase.from("almacen_customer_accounts").update({
            debt: nextDebt,
            total_purchases: nextTotalPurchases,
            status: nextDebt > 0 ? "En proceso" : "Finalizado",
          }),
        ).eq("id", (account as any).id)

        if (accountUpdateError && !isMissingTableError(accountUpdateError)) {
          console.error("Error updating almacen_customer_accounts:", accountUpdateError)
        }
      }

      return { success: true, sale }
    } catch (error) {
      console.error("createAlmacenSale error:", error)
      return { success: false, error }
    }
  }

  const addSale = async (saleData: Sale) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("ventas")
      return { success: false, error: new Error("Sin permiso para agregar ventas.") }
    }

    const normalizedItems = normalizeCartItemsForPersistence(Array.isArray(saleData.items) ? saleData.items : []).map((item) => ({
      ...item,
      accountingVersion: 2 as const,
    }))
    const newSale: Sale = {
      ...saleData,
      items: normalizedItems,
      paymentMethod: normalizePaymentMethod(saleData.paymentMethod),
      createdAt: saleData.createdAt ?? new Date().toISOString(),
      createdByEmployeeId: saleData.createdByEmployeeId || currentUser?.id || undefined,
    }

    // 1. Optimistic update
    setSales((prev) => {
      if (prev.find((s) => s.id === newSale.id)) return prev
      return [newSale, ...prev]
    })

    // Update stock optimistically
    try {
      updateLocalStockForItems(newSale.items, -1)
    } catch (err) {
      console.error("Error updating stock optimistically:", err)
    }

    // Guardar en Supabase
    const supabase = createClient()
    markPendingLocalWrite(newSale.id)

    const { data: dbData, error } = await insertSaleRecord(supabase, newSale, true)

    if (error) {
      console.error("Error adding sale:", error)
      // Rollback optimistic update
      setSales((prev) => prev.filter((s) => s.id !== newSale.id))
      updateLocalStockForItems(newSale.items, 1)
      return { success: false, error }
    }

    // Update stock in DB
    try {
      await updateDbStockForItems(supabase, newSale.items, -1)
    } catch (err) {
      console.error("Error updating stocks in DB after sale:", err)
    }

    await syncAlmacenCreditLedger(newSale, supabase)

    return { success: true }
  }

  const updateSale = async (id: string, saleUpdate: Partial<Sale>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "ventas")
      throw new Error("Sin permiso para editar ventas.")
    }

    const previousSales = [...sales]
    const currentSale = sales.find((sale) => sale.id === id)

    // Optimistic update
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, ...saleUpdate } : s)))

    try {
      const updateData: any = {}
      const mergedSaleForSync = currentSale ? ({ ...currentSale, ...saleUpdate } as Sale) : null
      if (saleUpdate.status) updateData.status = saleUpdate.status
      if (saleUpdate.invoiceNumber) updateData.invoice_number = saleUpdate.invoiceNumber
      if (saleUpdate.date !== undefined) updateData.date = saleUpdate.date
      if (saleUpdate.total !== undefined) updateData.total = saleUpdate.total
      if (saleUpdate.items) updateData.items = saleUpdate.items
      if (saleUpdate.amountPaid !== undefined) updateData.amount_paid = saleUpdate.amountPaid
      if (saleUpdate.change !== undefined) updateData.change = saleUpdate.change
      if (saleUpdate.paymentMethod !== undefined) updateData.payment_method = saleUpdate.paymentMethod
      if (saleUpdate.customerName !== undefined) updateData.customer_name = saleUpdate.customerName
      if (saleUpdate.customerPhone !== undefined) updateData.customer_phone = saleUpdate.customerPhone
      if (saleUpdate.customerId !== undefined) updateData.customer_id = saleUpdate.customerId
      if (saleUpdate.createdByEmployeeId !== undefined) {
        updateData.created_by_employee_id = saleUpdate.createdByEmployeeId
      }
      if (saleUpdate.manualPaidChecked !== undefined) updateData.manual_paid_checked = saleUpdate.manualPaidChecked
      if (saleUpdate.creditResolved !== undefined) updateData.credit_resolved = saleUpdate.creditResolved
      if (saleUpdate.almacenCustomerAccountId !== undefined) {
        updateData.almacen_customer_account_id = saleUpdate.almacenCustomerAccountId
      }
      if (saleUpdate.almacenCustomerName !== undefined) updateData.almacen_customer_name = saleUpdate.almacenCustomerName
      if (saleUpdate.almacenCustomerPhone !== undefined) {
        updateData.almacen_customer_phone = saleUpdate.almacenCustomerPhone
      }
      if (saleUpdate.almacenSourceCustomerId !== undefined) {
        updateData.almacen_source_customer_id = saleUpdate.almacenSourceCustomerId
      }
      if (mergedSaleForSync) {
        updateData.payment_breakdown = buildSalePaymentBreakdownEntries(mergedSaleForSync)
      }
      updateData.updated_at = new Date().toISOString()

      const supabase = createClient()
      let { error } = await withTenantFilter(supabase.from("sales").update(updateData)).eq("id", id)
      if (
        error &&
        [
          "payment_breakdown",
          "almacen_customer_account_id",
          "almacen_customer_name",
          "almacen_customer_phone",
          "almacen_source_customer_id",
          "credit_resolved",
        ].some((column) => isMissingColumnError(error, column))
      ) {
        delete updateData.payment_breakdown
        delete updateData.almacen_customer_account_id
        delete updateData.almacen_customer_name
        delete updateData.almacen_customer_phone
        delete updateData.almacen_source_customer_id
        delete updateData.credit_resolved
        ;({ error } = await withTenantFilter(supabase.from("sales").update(updateData)).eq("id", id))
      }

      if (error) {
        console.error("Error updating sale:", error)
        setSales(previousSales)
        throw error
      }

      if (mergedSaleForSync?.status === "credito") {
        await syncAlmacenCreditLedger(mergedSaleForSync, supabase)
      }
    } catch (error) {
      console.error("Error updating sale:", error)
      setSales(previousSales)
      throw error
    }
  }

  const deleteSale = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "ventas")
      throw new Error("Sin permiso para eliminar ventas.")
    }

    const saleToDelete = sales.find((s) => s.id === id)
    if (!saleToDelete) return

    const previousSales = [...sales]
    const previousProducts = [...products]
    const previousCustomers = [...customers]
    const previousReturns = [...returns]

    // Do not remove from state until DB delete succeeds to avoid re-sync issues

    try {
      const supabase = createClient()

      // 2. Revertir Stock: usar helpers que resuelven sourceTable/sourceId correctamente
      try {
        console.debug("[deleteSale] reverting stock for sale id=", saleToDelete.id, "items=", saleToDelete.items)
        // Actualiza estado local primero
        updateLocalStockForItems(saleToDelete.items, 1)

        // Luego actualiza la BD
        await updateDbStockForItems(supabase, saleToDelete.items, 1)
        console.debug("[deleteSale] stock revert attempted for sale id=", saleToDelete.id)
      } catch (err) {
        console.error("Error revirtiendo stock al eliminar venta:", err)
      }

      // 3. Revertir Deuda y Total de Compras del Cliente
      if (saleToDelete.customerId) {
        const customer = customers.find((c) => c.id === saleToDelete.customerId)
        if (customer) {
          const debtToSubtract =
            saleToDelete.status === "credito" ? Math.max(0, saleToDelete.total - saleToDelete.amountPaid) : 0

          await runWithInternalCrudBypass(() => updateCustomer(customer.id, {
            debt: Math.max(0, customer.debt - debtToSubtract),
            totalPurchases: Math.max(0, customer.totalPurchases - saleToDelete.total),
          }))
        }
      }

      // 4. Eliminar registro archivado de factura (si existe)
      if (currentUser?.adminId) {
        await deleteInvoiceFromStorage(saleToDelete.date, id, currentUser.adminId).catch((err) => {
          console.error("Error eliminando factura archivada:", err)
        })
      }

      // 4.1. Limpiar el espejo de crédito de almacén para mantener ambos historiales alineados
      try {
        if (!isTableMissing("almacen_credit_sales")) {
          const { error: almacenCreditDeleteError } = await withTenantFilter(
            supabase.from("almacen_credit_sales").delete(),
          ).eq("sale_id", id)

          if (almacenCreditDeleteError && !isMissingTableError(almacenCreditDeleteError)) {
            console.error("Error eliminando almacen_credit_sales:", almacenCreditDeleteError)
          }
        }
      } catch (err) {
        console.error("Error eliminando almacen_credit_sales durante deleteSale:", err)
      }

      // 4.2. Revertir y limpiar payment_allocations asociadas a esta venta
      try {
          if (!isTableMissing("payment_allocations")) {
            const { data: allocations, error: allocFetchError } = await withTenantFilter(
              supabase.from("payment_allocations").select("*")
            ).eq("sale_id", id)

            if (allocFetchError) {
              console.error("Error fetching allocations for sale deletion:", allocFetchError)
            } else if (Array.isArray(allocations) && allocations.length > 0) {
              for (const alloc of allocations) {
                const paymentId = alloc.payment_id
                const applied = Number(alloc.applied_amount || 0)

                // Update payment.remaining_debt in DB
                try {
                  const { data: paymentRows, error: paymentFetchErr } = await withTenantFilter(
                    supabase.from("payments").select("*")
                  ).eq("id", paymentId).limit(1)

                  if (paymentFetchErr) {
                    console.error("Error fetching payment for allocation revert:", paymentFetchErr)
                  } else if (Array.isArray(paymentRows) && paymentRows.length > 0) {
                    const paymentRow = paymentRows[0]
                    const currentRemaining = Number(paymentRow.remaining_debt || 0)
                    const nextRemaining = Math.max(0, currentRemaining + applied)

                    const { error: paymentUpdateErr } = await withTenantFilter(
                      supabase.from("payments").update({ remaining_debt: nextRemaining }),
                    ).eq("id", paymentId)

                    if (paymentUpdateErr) {
                      console.error("Error updating payment remaining_debt during sale deletion:", paymentUpdateErr)
                    } else {
                      // Update local payments state
                      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, remainingDebt: nextRemaining } : p)))
                    }
                  }
                } catch (err) {
                  console.error("Error handling allocation revert for payment:", err)
                }
              }

              // Delete allocation rows for this sale
              const { error: deleteAllocErr } = await withTenantFilter(supabase.from("payment_allocations").delete()).eq("sale_id", id)
              if (deleteAllocErr) console.error("Error deleting payment_allocations for sale:", deleteAllocErr)
              else setPaymentAllocations((prev) => prev.filter((a) => a.saleId !== id))
            }
          }
        } catch (err) {
          console.error("Error cleaning payment allocations during sale deletion:", err)
        }

      // 5. Eliminar de la base de datos
      // A sale and its returns are one accounting operation. Remove any
      // associated returns explicitly so local report state cannot keep an
      // orphaned adjustment after the invoice is deleted.
      try {
        if (!isTableMissing("returns")) {
          const { error: returnsDeleteError } = await withTenantFilter(
            supabase.from("returns").delete(),
          ).eq("invoice_id", id)
          if (returnsDeleteError && !isMissingTableError(returnsDeleteError)) {
            throw returnsDeleteError
          }
        }
      } catch (returnsError) {
        console.error("Error eliminando devoluciones asociadas:", returnsError)
        throw returnsError
      }

      const { error } = await withTenantFilter(supabase.from("sales").delete()).eq("id", id)

      if (error) {
        console.error("Error deleting sale:", error)
        throw error
      }

      // Only remove from local state after DB confirmed deletion
      setSales((prev) => prev.filter((s) => s.id !== id))
      setReturns((prev) => prev.filter((ret) => ret.invoiceId !== id))

      toast({
        title: "Factura eliminada",
        description: "Se ha restaurado el inventario y ajustado la deuda del cliente.",
      })
    } catch (error) {
      console.error("Error deleting sale:", error)
      // Rollback
      setSales(previousSales)
      setProducts(previousProducts)
      setCustomers(previousCustomers)
      setReturns(previousReturns)
      toast({
        title: "Error al eliminar",
        description: "No se pudieron revertir todos los cambios asociados a la factura.",
        variant: "destructive",
      })
      throw error
    }
  }

  const addCustomer = async (customer: Omit<Customer, "id">): Promise<string | undefined> => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("clientes")
      return undefined
    }

    const normalizedReminderMessage =
      typeof customer.reminderMessage === "string" && customer.reminderMessage.trim().length > 0
        ? customer.reminderMessage.trim()
        : null
    const normalizedReminderIntervalDays = normalizeReminderIntervalDays(customer.reminderIntervalDays)
    const tempId = crypto.randomUUID()
    const newCustomer: Customer = {
      ...customer,
      id: tempId,
      debt: customer.debt || 0,
      totalPurchases: customer.totalPurchases || 0,
      creditBalance: customer.creditBalance || 0,
      creditLimit: customer.creditLimit || 0,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      cedula: customer.cedula || "",
      status: customer.status || "En proceso",
      creditDevice: customer.creditDevice || "",
      notes: customer.notes || "",
      reminderEnabled: customer.reminderEnabled ?? false,
      reminderIntervalDays: normalizedReminderIntervalDays,
      reminderLastSentAt: customer.reminderLastSentAt ?? null,
      reminderMessage: normalizedReminderMessage,
    }

    // 1. Optimistic update
    setCustomers((prev) => [newCustomer, ...prev])

    const supabase = createClient()
    const { data, error } = await supabase
      .from("customers")
      .insert(
        withTenantPayload({
          id: tempId,
          name: customer.name,
          cedula: customer.cedula,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          status: customer.status || "En proceso",
          credit_device: customer.creditDevice,
          notes: customer.notes,
          debt: customer.debt || 0,
          total_purchases: customer.totalPurchases || 0,
          credit_balance: customer.creditBalance || 0,
          credit_limit: customer.creditLimit || 0,
          reminder_enabled: customer.reminderEnabled ?? false,
          reminder_interval_days: normalizedReminderIntervalDays,
          reminder_message: normalizedReminderMessage,
        }),
      )
      .select()
      .single()

    if (error) {
      console.error("Error adding customer:", error)
      // Rollback
      setCustomers((prev) => prev.filter((c) => c.id !== tempId))
      return undefined
    }

    if (data) {
      markPendingLocalWrite(data.id)
      setCustomers((prev) => prev.map((c) => (c.id === tempId ? mapCustomerFromDB(data) : c)))
      return data.id
    }
    return tempId
  }

  const updateCustomer = async (id: string, updatedCustomer: Partial<Customer>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "clientes")
      return
    }

    const previousCustomers = [...customers]
    const normalizedReminderIntervalDays =
      updatedCustomer.reminderIntervalDays !== undefined
        ? normalizeReminderIntervalDays(updatedCustomer.reminderIntervalDays)
        : undefined

    // Optimistic update
    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === id
          ? {
              ...customer,
              ...updatedCustomer,
              ...(normalizedReminderIntervalDays !== undefined
                ? { reminderIntervalDays: normalizedReminderIntervalDays }
                : {}),
            }
          : customer,
      ),
    )

    try {
      const supabase = createClient()
      const updateData: Record<string, unknown> = {}
      if (updatedCustomer.name !== undefined) updateData.name = updatedCustomer.name
      if (updatedCustomer.cedula !== undefined) updateData.cedula = updatedCustomer.cedula
      if (updatedCustomer.phone !== undefined) updateData.phone = updatedCustomer.phone
      if (updatedCustomer.email !== undefined) updateData.email = updatedCustomer.email
      if (updatedCustomer.address !== undefined) updateData.address = updatedCustomer.address
      if (updatedCustomer.status !== undefined) updateData.status = updatedCustomer.status
      if (updatedCustomer.creditDevice !== undefined) updateData.credit_device = updatedCustomer.creditDevice
      if (updatedCustomer.notes !== undefined) updateData.notes = updatedCustomer.notes
      if (updatedCustomer.debt !== undefined) updateData.debt = updatedCustomer.debt
      if (updatedCustomer.totalPurchases !== undefined) updateData.total_purchases = updatedCustomer.totalPurchases
      if (updatedCustomer.creditBalance !== undefined) updateData.credit_balance = updatedCustomer.creditBalance
      if (updatedCustomer.creditLimit !== undefined) updateData.credit_limit = updatedCustomer.creditLimit
      if (updatedCustomer.reminderEnabled !== undefined) updateData.reminder_enabled = updatedCustomer.reminderEnabled
      if (normalizedReminderIntervalDays !== undefined) updateData.reminder_interval_days = normalizedReminderIntervalDays
      if (updatedCustomer.reminderLastSentAt !== undefined) updateData.reminder_last_sent_at = updatedCustomer.reminderLastSentAt
      if (updatedCustomer.reminderMessage !== undefined) {
        if (typeof updatedCustomer.reminderMessage === "string") {
          const trimmed = updatedCustomer.reminderMessage.trim()
          updateData.reminder_message = trimmed.length > 0 ? trimmed : null
        } else {
          updateData.reminder_message = updatedCustomer.reminderMessage
        }
      }

      const { error } = await withTenantFilter(supabase.from("customers").update(updateData)).eq("id", id)

      if (error) {
        console.error("Error updating customer:", error)
        setCustomers(previousCustomers)
        return
      }
    } catch (error) {
      console.error("Error updating customer:", error)
      setCustomers(previousCustomers)
    }
  }

  const deleteCustomer = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "clientes")
      return
    }

    const previousCustomers = [...customers]

    // Optimistic delete
    setCustomers((prev) => prev.filter((customer) => customer.id !== id))

    try {
      const supabase = createClient()
      const { error } = await withTenantFilter(supabase.from("customers").delete()).eq("id", id)

      if (error) {
        console.error("Error deleting customer:", error)
        setCustomers(previousCustomers)
        return
      }
    } catch (error) {
      console.error("Error deleting customer:", error)
      setCustomers(previousCustomers)
    }
  }

  const addSupplier = async (supplier: Omit<Supplier, "id">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("proveedores")
      return
    }

    const tempId = generateUUID()
    const newSupplier: Supplier = {
      ...supplier,
      id: tempId,
      debt: supplier.debt || 0,
      totalPurchases: supplier.totalPurchases || 0,
    }

    // 1. Optimistic update
    setSuppliers((prev) => [newSupplier, ...prev])

    const supabase = createClient()
    const { data, error } = await supabase
      .from("suppliers")
      .insert(
        withTenantPayload({
          id: tempId,
          name: supplier.name,
          rnc: supplier.rnc,
          razon_social: supplier.razonSocial,
          tipo_empresa: supplier.tipoEmpresa,
          website: supplier.website,
          contact: supplier.contact,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          debt: supplier.debt || 0,
          total_purchases: supplier.totalPurchases || 0,
        }),
      )
      .select()
      .single()

    if (error) {
      console.error("Error adding supplier:", error)
      // Rollback
      setSuppliers((prev) => prev.filter((s) => s.id !== tempId))
      return
    }

    if (data) {
      markPendingLocalWrite(data.id)
      setSuppliers((prev) => prev.map((s) => (s.id === tempId ? mapSupplierFromDB(data) : s)))
    }
  }

  const updateSupplier = async (id: string, updatedSupplier: Partial<Supplier>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "proveedores")
      return
    }

    const previousSuppliers = [...suppliers]

    // Optimistic update
    setSuppliers((prev) =>
      prev.map((supplier) => (supplier.id === id ? { ...supplier, ...updatedSupplier } : supplier)),
    )

    try {
      const supabase = createClient()
      const updateData: Record<string, unknown> = {}
      if (updatedSupplier.name !== undefined) updateData.name = updatedSupplier.name
      if (updatedSupplier.rnc !== undefined) updateData.rnc = updatedSupplier.rnc
      if (updatedSupplier.razonSocial !== undefined) updateData.razon_social = updatedSupplier.razonSocial
      if (updatedSupplier.tipoEmpresa !== undefined) updateData.tipo_empresa = updatedSupplier.tipoEmpresa
      if (updatedSupplier.website !== undefined) updateData.website = updatedSupplier.website
      if (updatedSupplier.contact !== undefined) updateData.contact = updatedSupplier.contact
      if (updatedSupplier.phone !== undefined) updateData.phone = updatedSupplier.phone
      if (updatedSupplier.email !== undefined) updateData.email = updatedSupplier.email
      if (updatedSupplier.address !== undefined) updateData.address = updatedSupplier.address
      if (updatedSupplier.debt !== undefined) updateData.debt = updatedSupplier.debt
      if (updatedSupplier.totalPurchases !== undefined) updateData.total_purchases = updatedSupplier.totalPurchases

      const { error } = await withTenantFilter(supabase.from("suppliers").update(updateData)).eq("id", id)

      if (error) {
        console.error("Error updating supplier:", error)
        setSuppliers(previousSuppliers)
        return
      }
    } catch (error) {
      console.error("Error updating supplier:", error)
      setSuppliers(previousSuppliers)
    }
  }

  const deleteSupplier = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "proveedores")
      return
    }

    const previousSuppliers = [...suppliers]

    // Optimistic delete
    setSuppliers((prev) => prev.filter((supplier) => supplier.id !== id))

    try {
      const supabase = createClient()
      const { error } = await withTenantFilter(supabase.from("suppliers").delete()).eq("id", id)

      if (error) {
        console.error("Error deleting supplier:", error)
        setSuppliers(previousSuppliers)
        return
      }
    } catch (error) {
      console.error("Error deleting supplier:", error)
      setSuppliers(previousSuppliers)
    }
  }

  const addPayment: StoreContextType["addPayment"] = async (payment) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("pagos")
      throw new Error("Sin permiso para agregar pagos.")
    }

    const { allocations = [], ...paymentInput } = payment
    const tempId = generateUUID()
    const newPayment: Payment = {
      ...paymentInput,
      id: tempId,
      invoiceNumber: generateInvoiceNumber(),
      date: new Date().toISOString(),
      paymentMethod: normalizePaymentMethod(paymentInput.paymentMethod),
      paymentKind: normalizePaymentRecordKind(paymentInput.paymentKind),
      customerType: paymentInput.customerType === "almacen" ? "almacen" : "general",
      createdByEmployeeId: isUuid(currentUser?.id) ? currentUser.id : undefined,
      createdByEmployeeName: currentUser?.name ?? undefined,
    }

    const supabase = createClient()
    const customer = customers.find((c) => c.id === newPayment.customerId)

    if (newPayment.customerType === "almacen") {
      const { data: almacenAccount, error: almacenError } = await withTenantFilter(
        supabase.from("almacen_customer_accounts").select("id, debt, source_customer_id"),
      ).eq("id", newPayment.customerId).maybeSingle()

      if (almacenError) {
        console.error("Error finding almacen customer account:", almacenError)
        throw almacenError
      }

      if (!almacenAccount) {
        throw new Error("No se encontró la cuenta de Cliente Almacen para registrar el abono.")
      }

      const remainingDebt = Math.max(0, Number(almacenAccount.debt || 0) - newPayment.amount)
      const { error: paymentInsertError } = await supabase.from("almacen_payments").insert(
        withTenantPayload({
          id: newPayment.id,
          invoice_number: newPayment.invoiceNumber,
          customer_account_id: newPayment.customerId,
          source_customer_id: almacenAccount.source_customer_id ?? null,
          amount: newPayment.amount,
          previous_debt: newPayment.previousDebt,
          remaining_debt: remainingDebt,
          payment_method: newPayment.paymentMethod,
          date: newPayment.date,
          note: newPayment.note,
          created_by: currentUser?.id ?? null,
          created_by_name: currentUser?.name ?? null,
        }),
      )

      if (paymentInsertError) {
        console.error("Error adding almacen payment:", paymentInsertError)
        throw paymentInsertError
      }

      const { error: accountUpdateError } = await withTenantFilter(
        supabase
          .from("almacen_customer_accounts")
          .update({ debt: remainingDebt, status: remainingDebt > 0 ? "En proceso" : "Finalizado" }),
      ).eq("id", newPayment.customerId)

      if (accountUpdateError) {
        console.error("Error updating almacen customer debt:", accountUpdateError)
        throw accountUpdateError
      }

      return {
        ...newPayment,
        remainingDebt,
      }
    }

    // 1. Optimistic update
    setPayments((prev) => [newPayment, ...prev])

    if (customer) {
      const newDebt = Math.max(0, customer.debt - paymentInput.amount)
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, debt: newDebt } : c)))
    }

    markPendingLocalWrite(newPayment.id)

    const baseInsertPayload: Record<string, unknown> = withTenantPayload({
      id: newPayment.id,
      invoice_number: newPayment.invoiceNumber,
      customer_id: newPayment.customerId,
      amount: newPayment.amount,
      previous_debt: newPayment.previousDebt,
      remaining_debt: newPayment.remainingDebt,
      date: newPayment.date,
      payment_method: newPayment.paymentMethod,
      note: newPayment.note,
      payment_kind: newPayment.paymentKind,
      customer_type: newPayment.customerType,
      // No enviar IDs locales en una columna UUID; el nombre queda guardado
      // para identificar al responsable y los cierres también lo reconocen.
      created_by_employee_id: isUuid(newPayment.createdByEmployeeId) ? newPayment.createdByEmployeeId : null,
      created_by_name: newPayment.createdByEmployeeName ?? null,
    })

    let { error } = await supabase.from("payments").insert(baseInsertPayload)
    if (
      error &&
      (isMissingColumnError(error, "payment_kind") ||
        isMissingColumnError(error, "customer_type") ||
        isMissingColumnError(error, "payment_method") ||
        isMissingColumnError(error, "created_by_employee_id") ||
        isMissingColumnError(error, "created_by_name"))
    ) {
      const legacyPayload = { ...baseInsertPayload }
      delete legacyPayload.payment_kind
      delete legacyPayload.customer_type
      delete legacyPayload.payment_method
      delete legacyPayload.created_by_employee_id
      legacyPayload.note = appendPaymentResponsibleNote(newPayment.note, newPayment.createdByEmployeeName)
      delete legacyPayload.created_by_name
      ;({ error } = await supabase.from("payments").insert(legacyPayload))
    }

    if (error) {
      console.error("Error adding payment:", error)
      setPayments((prev) => prev.filter((p) => p.id !== tempId))
      if (customer) {
        setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, debt: customer.debt } : c)))
      }
      throw error
    }

    if (allocations.length > 0 && !isTableMissing("payment_allocations")) {
      const allocationRows = allocations.map((allocation) =>
        withTenantPayload({
          id: generateUUID(),
          payment_id: newPayment.id,
          sale_id: allocation.saleId,
          invoice_number: allocation.invoiceNumber,
          applied_amount: allocation.appliedAmount,
          pending_before: allocation.pendingBefore,
          pending_after: allocation.pendingAfter,
        }),
      )

      const { data: insertedAllocations, error: allocationError } = await supabase
        .from("payment_allocations")
        .insert(allocationRows)
        .select()

      if (allocationError) {
        if (!isMissingTableError(allocationError)) {
          console.error("Error adding payment allocations:", allocationError)
        }
      } else if (insertedAllocations) {
        setPaymentAllocations((prev) => [...insertedAllocations.map(mapPaymentAllocationFromDB), ...prev])
      }
    }

    if (customer) {
      const newDebt = Math.max(0, customer.debt - paymentInput.amount)
      await withTenantFilter(supabase.from("customers").update({ debt: newDebt })).eq("id", customer.id)
    }

    return newPayment
  }

  const deletePayment = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "pagos")
      throw new Error("Sin permiso para eliminar pagos.")
    }

    const paymentToDelete = payments.find((payment) => payment.id === id)
    if (!paymentToDelete) {
      throw new Error("No se encontró el pago que desea eliminar.")
    }

    const latestCustomerPayment = [...payments]
      .filter((payment) => payment.customerId === paymentToDelete.customerId)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
        if (dateDiff !== 0) return dateDiff
        return b.invoiceNumber.localeCompare(a.invoiceNumber)
      })[0]

    if (latestCustomerPayment?.id !== paymentToDelete.id) {
      throw new Error("Solo se puede eliminar el último abono de este cliente para no alterar el historial.")
    }

    const customer = customers.find((item) => item.id === paymentToDelete.customerId)
    const restoredDebt = customer ? Number(customer.debt || 0) + Number(paymentToDelete.amount || 0) : 0
    const previousPayments = [...payments]
    const previousCustomers = [...customers]

    setPayments((prev) => prev.filter((payment) => payment.id !== id))

    if (customer) {
      setCustomers((prev) =>
        prev.map((item) =>
          item.id === customer.id
            ? {
              ...item,
              debt: restoredDebt,
            }
            : item,
        ),
      )
    }

    try {
      const supabase = createClient()

      if (customer) {
        const { error: customerError } = await withTenantFilter(
          supabase.from("customers").update({ debt: restoredDebt }),
        ).eq("id", customer.id)

        if (customerError) {
          throw customerError
        }
      }

        // 1. Revert payment allocations: adjust related sales (amount_paid) and credit records
        if (!isTableMissing("payment_allocations")) {
          const { data: allocations, error: allocError } = await withTenantFilter(
            supabase.from("payment_allocations").select("*")
          ).eq("payment_id", id)

          if (allocError && !isMissingTableError(allocError)) {
            console.error("Error fetching payment allocations for deletion:", allocError)
            throw allocError
          }

          if (Array.isArray(allocations) && allocations.length > 0) {
            for (const alloc of allocations) {
              const saleId = alloc.sale_id
              const applied = Number(alloc.applied_amount || 0)

              const localSale = sales.find((s) => s.id === saleId)
              const currentAmountPaid = localSale ? Number(localSale.amountPaid || 0) : 0
              const nextAmountPaid = Math.max(0, currentAmountPaid - applied)
              const nextPending = localSale ? Math.max(0, Number(localSale.total || 0) - nextAmountPaid) : 0
              const nextStatus = nextPending <= 0 ? "completada" : "credito"

              // Update main sales table
              const { error: salesUpdateError } = await withTenantFilter(
                supabase.from("sales").update({
                  amount_paid: nextAmountPaid,
                  status: nextStatus,
                  credit_resolved: nextPending <= 0,
                  updated_at: new Date().toISOString(),
                }),
              ).eq("id", saleId)

              if (salesUpdateError) {
                console.error("Error reverting sale amount_paid after payment deletion:", salesUpdateError)
              }

              // Update almacen_credit_sales if present
              const { error: creditUpdateError } = await withTenantFilter(
                supabase.from("almacen_credit_sales").update({ amount_paid: nextAmountPaid, status: nextStatus }),
              ).eq("id", saleId)

              if (creditUpdateError) {
                // Try matching by sale_id or invoice_number as a fallback
                await withTenantFilter(
                  supabase
                    .from("almacen_credit_sales")
                    .update({ amount_paid: nextAmountPaid, status: nextStatus }),
                ).or(`sale_id.eq.${saleId},id.eq.${saleId}`)
              }

              // Update local sales state
              setSales((prev) =>
                prev.map((s) =>
                  s.id === saleId
                    ? { ...s, amountPaid: nextAmountPaid, status: nextStatus, creditResolved: nextPending <= 0 }
                    : s,
                ),
              )
            }

            // Remove allocations rows
            const { error: deleteAllocError } = await withTenantFilter(
              supabase.from("payment_allocations").delete(),
            ).eq("payment_id", id)

            if (deleteAllocError) {
              console.error("Error deleting payment allocations:", deleteAllocError)
            }
          }
        }

        // 2. Delete the payment record
        const { error: deleteError } = await withTenantFilter(supabase.from("payments").delete()).eq("id", id)

        if (deleteError) {
          if (customer) {
            await withTenantFilter(supabase.from("customers").update({ debt: customer.debt })).eq("id", customer.id)
          }
          throw deleteError
        }
    } catch (error) {
      console.error("Error deleting payment:", error)
      setPayments(previousPayments)
      setCustomers(previousCustomers)
      throw error
    }
  }

  const addPurchase = async (purchaseData: Omit<Purchase, "id" | "invoiceNumber" | "date">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("compras")
      throw new Error("Sin permiso para agregar compras.")
    }

    const tempId = generatePurchaseNumber()
    const newPurchase: Purchase = {
      ...purchaseData,
      id: tempId,
      invoiceNumber: tempId,
      date: new Date().toISOString(),
    }

    // 1. Optimistic update
    setPurchases((prev) => [newPurchase, ...prev])

    // Optimistically update stock
    newPurchase.items.forEach((item) => {
      setProducts((prev) =>
        prev.map((p) => (p.id === item.productId ? { ...p, stock: p.stock + item.quantity } : p))
      )
    })

    // Optimistically update supplier debt
    const supplier = suppliers.find((s) => s.id === purchaseData.supplierId)
    if (supplier) {
      const debtIncrease = purchaseData.paymentType === "credito" ? purchaseData.total - purchaseData.amountPaid : 0
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplier.id ? {
          ...s,
          debt: s.debt + debtIncrease,
          totalPurchases: s.totalPurchases + purchaseData.total
        } : s))
      )
    }

    // Guardar en Supabase
    const supabase = createClient()
    markPendingLocalWrite(newPurchase.id)
    const { error } = await supabase.from("purchases").insert(
      withTenantPayload({
        id: newPurchase.id,
        invoice_number: newPurchase.invoiceNumber,
        date: newPurchase.date,
        supplier_id: newPurchase.supplierId,
        supplier_name: newPurchase.supplierName,
        items: newPurchase.items,
        subtotal: newPurchase.subtotal,
        tax: newPurchase.tax,
        total: newPurchase.total,
        payment_type: newPurchase.paymentType,
        payment_method: newPurchase.paymentMethod,
        amount_paid: newPurchase.amountPaid,
        due_date: newPurchase.dueDate,
        status: newPurchase.status,
        notes: newPurchase.notes,
        purchase_kind: newPurchase.purchaseKind || "productos",
        attachment_url: newPurchase.attachmentUrl,
        attachment_type: newPurchase.attachmentType,
      }),
    )

    if (error) {
      console.error("Error adding purchase to Supabase:", error)
      // Rollback
      setPurchases((prev) => prev.filter((p) => p.id !== tempId))
      // ... other rollbacks could be added here
      throw error
    }

    // Update DB stocks
    try {
      await Promise.all(
        newPurchase.items.map(async (item) => {
          const product = products.find((p) => p.id === item.productId)
          if (product) {
            await withTenantFilter(
              supabase
                .from(resolveInventoryTableById(product.id, product))
                .update({ stock: product.stock + item.quantity }),
            ).eq("id", product.sourceId || parseSourceRuntimeId(product.id)?.sourceId || product.id)
          }
        })
      )
    } catch (err) {
      console.error("Error updating stocks in DB after purchase:", err)
    }

    // Update DB supplier
    if (supplier) {
      const debtIncrease = purchaseData.paymentType === "credito" ? purchaseData.total - purchaseData.amountPaid : 0
      await withTenantFilter(
        supabase.from("suppliers").update({
          debt: supplier.debt + debtIncrease,
          total_purchases: supplier.totalPurchases + purchaseData.total,
        }),
      ).eq("id", supplier.id)
    }

    return newPurchase
  }

  const updatePurchase = async (id: string, updatedPurchase: Partial<Purchase>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "compras")
      throw new Error("Sin permiso para editar compras.")
    }

    const previousPurchases = [...purchases]

    // Optimistic update
    setPurchases((prev) =>
      prev.map((purchase) => (purchase.id === id ? { ...purchase, ...updatedPurchase } : purchase)),
    )

    try {
      const supabase = createClient()
      const updateData: Record<string, unknown> = {}

      if (updatedPurchase.invoiceNumber !== undefined) updateData.invoice_number = updatedPurchase.invoiceNumber
      if (updatedPurchase.date !== undefined) updateData.date = updatedPurchase.date
      if (updatedPurchase.supplierId !== undefined) updateData.supplier_id = updatedPurchase.supplierId
      if (updatedPurchase.supplierName !== undefined) updateData.supplier_name = updatedPurchase.supplierName
      if (updatedPurchase.items !== undefined) updateData.items = updatedPurchase.items
      if (updatedPurchase.subtotal !== undefined) updateData.subtotal = updatedPurchase.subtotal
      if (updatedPurchase.tax !== undefined) updateData.tax = updatedPurchase.tax
      if (updatedPurchase.total !== undefined) updateData.total = updatedPurchase.total
      if (updatedPurchase.paymentType !== undefined) updateData.payment_type = updatedPurchase.paymentType
      if (updatedPurchase.paymentMethod !== undefined) updateData.payment_method = updatedPurchase.paymentMethod
      if (updatedPurchase.amountPaid !== undefined) updateData.amount_paid = updatedPurchase.amountPaid
      if (updatedPurchase.dueDate !== undefined) updateData.due_date = updatedPurchase.dueDate
      if (updatedPurchase.status !== undefined) updateData.status = updatedPurchase.status
      if (updatedPurchase.notes !== undefined) updateData.notes = updatedPurchase.notes
      if (updatedPurchase.purchaseKind !== undefined) updateData.purchase_kind = updatedPurchase.purchaseKind
      if (updatedPurchase.attachmentUrl !== undefined) updateData.attachment_url = updatedPurchase.attachmentUrl
      if (updatedPurchase.attachmentType !== undefined) updateData.attachment_type = updatedPurchase.attachmentType

      const { error } = await withTenantFilter(supabase.from("purchases").update(updateData)).eq("id", id)

      if (error) {
        console.error("Error updating purchase in Supabase:", error)
        // Rollback
        setPurchases(previousPurchases)
        return
      }
    } catch (error) {
      console.error("Error updating purchase:", error)
      // Rollback
      setPurchases(previousPurchases)
    }
  }

  const addSupplierPayment = async (
    payment: Omit<SupplierPayment, "id" | "date" | "previousDebt" | "remainingDebt">,
  ) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("abonos de proveedores")
      throw new Error("Sin permiso para agregar abonos de proveedores.")
    }

    const supplier = suppliers.find((item) => item.id === payment.supplierId)
    if (!supplier) throw new Error("Proveedor no encontrado")
    if (payment.amount <= 0 || payment.amount > supplier.debt) throw new Error("Monto de abono inválido")

    const pendingPurchases = purchases
      .filter((purchase) => purchase.supplierId === payment.supplierId && purchase.total - purchase.amountPaid > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const preferredPurchase = payment.purchaseId
      ? pendingPurchases.find((purchase) => purchase.id === payment.purchaseId)
      : undefined
    const allocationOrder = preferredPurchase
      ? [preferredPurchase, ...pendingPurchases.filter((purchase) => purchase.id !== preferredPurchase.id)]
      : pendingPurchases

    let amountToAllocate = payment.amount
    let runningDebt = supplier.debt
    const paymentDate = new Date().toISOString()
    const purchaseUpdates: Array<{ id: string; amountPaid: number; status: Purchase["status"] }> = []
    const allocatedPayments: SupplierPayment[] = []

    for (const purchase of allocationOrder) {
      if (amountToAllocate <= 0) break
      const pendingAmount = Math.max(0, purchase.total - purchase.amountPaid)
      const appliedAmount = Math.min(amountToAllocate, pendingAmount)
      if (appliedAmount <= 0) continue

      const nextAmountPaid = Math.min(purchase.total, purchase.amountPaid + appliedAmount)
      const previousDebt = runningDebt
      runningDebt = Math.max(0, runningDebt - appliedAmount)
      purchaseUpdates.push({
        id: purchase.id,
        amountPaid: nextAmountPaid,
        status: nextAmountPaid >= purchase.total ? "pagado" : "parcial",
      })
      allocatedPayments.push({
        id: generateUUID(),
        supplierId: payment.supplierId,
        purchaseId: purchase.id,
        amount: appliedAmount,
        date: paymentDate,
        paymentMethod: payment.paymentMethod,
        previousDebt,
        remainingDebt: runningDebt,
        note: payment.note,
        attachmentUrl: payment.attachmentUrl,
      })
      amountToAllocate -= appliedAmount
    }

    if (amountToAllocate > 0 || allocatedPayments.length === 0) {
      throw new Error("La deuda del proveedor no coincide con las facturas pendientes")
    }

    const previousPurchases = purchases
    const previousSuppliers = suppliers
    const previousPayments = supplierPayments
    const updatedPurchaseMap = new Map(purchaseUpdates.map((update) => [update.id, update]))

    setPurchases((current) => current.map((purchase) => {
      const update = updatedPurchaseMap.get(purchase.id)
      return update ? { ...purchase, amountPaid: update.amountPaid, status: update.status } : purchase
    }))
    setSuppliers((current) => current.map((item) => (
      item.id === supplier.id ? { ...item, debt: runningDebt } : item
    )))
    setSupplierPayments((current) => [...allocatedPayments].reverse().concat(current))

    try {
      const supabase = createClient()
      allocatedPayments.forEach((item) => markPendingLocalWrite(item.id))
      const { error: paymentError } = await supabase.from("supplier_payments").insert(
        allocatedPayments.map((item) => withTenantPayload({
          id: item.id,
          supplier_id: item.supplierId,
          purchase_id: item.purchaseId,
          amount: item.amount,
          date: item.date,
          payment_method: item.paymentMethod,
          previous_debt: item.previousDebt,
          remaining_debt: item.remainingDebt,
          note: item.note,
          attachment_url: item.attachmentUrl,
        })),
      )
      if (paymentError) throw paymentError

      for (const update of purchaseUpdates) {
        const { error } = await withTenantFilter(
          supabase.from("purchases").update({ amount_paid: update.amountPaid, status: update.status }),
        ).eq("id", update.id)
        if (error) throw error
      }

      const { error: supplierError } = await withTenantFilter(
        supabase.from("suppliers").update({ debt: runningDebt }),
      ).eq("id", supplier.id)
      if (supplierError) throw supplierError

      return allocatedPayments
    } catch (error) {
      console.error("Error distributing supplier payment in Supabase:", error)
      setPurchases(previousPurchases)
      setSuppliers(previousSuppliers)
      setSupplierPayments(previousPayments)
      throw error
    }
  }

  const getReturnsByInvoice = useCallback(
    (invoiceId: string) => {
      return returns.filter((r) => r.invoiceId === invoiceId)
    },
    [returns],
  )

  const getReturnedQuantity = useCallback(
    (invoiceId: string, productId: string) => {
      const invoiceReturns = returns.filter((r) => r.invoiceId === invoiceId)
      return invoiceReturns.reduce((total, r) => {
        const item = r.items.find(
          (i) =>
            i.productId === productId ||
            sameSaleItemSource(i as unknown as Record<string, unknown>, { id: productId, productId } as Record<string, unknown>),
        )
        return total + (item?.quantity || 0)
      }, 0)
    },
    [returns],
  )

  const getBaseSaleStatus = (sale: Sale): Sale["status"] => {
    if (sale.status === "anulada" || sale.status === "pending") return sale.status

    const pendingCreditAmount = Math.max(0, Number(sale.total || 0) - Number(sale.amountPaid || 0))
    if (sale.status === "credito" || sale.paymentMethod === "credit" || pendingCreditAmount > 0) {
      return "credito"
    }

    return "completada"
  }

  const calculateSaleStatusFromReturns = (sale: Sale, saleReturns: Return[]): Sale["status"] => {
    const totalItemsInSale = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    const totalReturned = saleReturns.reduce(
      (sum, returned) => sum + returned.items.reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0),
      0,
    )

    if (totalItemsInSale <= 0 || totalReturned <= 0) {
      return getBaseSaleStatus(sale)
    }

    return totalReturned >= totalItemsInSale ? "devuelta_completa" : "devuelta_parcial"
  }

  const addReturn = async (returnData: Omit<Return, "id" | "returnNumber" | "date">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("devoluciones")
      throw new Error("Sin permiso para agregar devoluciones.")
    }

    const tempId = generateUUID()
    const normalizedReturnItems = (Array.isArray(returnData.items) ? returnData.items : []).map((item) => ({
      ...normalizeReturnItemForPersistence(item),
      accountingVersion: 2 as const,
    }))
    const newReturn: Return = {
      ...returnData,
      items: normalizedReturnItems,
      id: tempId,
      returnNumber: generateReturnNumber(),
      date: new Date().toISOString(),
      returnToInventory: returnData.returnToInventory !== undefined ? returnData.returnToInventory : true,
      accountingVersion: 2,
      createdByEmployeeId: returnData.createdByEmployeeId || currentUser?.id,
      createdByEmployeeName: returnData.createdByEmployeeName || currentUser?.name || "Sistema",
    }

    const sale = sales.find((s) => s.id === returnData.invoiceId)
    const returnCustomer =
      (returnData.customerId && customers.find((c) => c.id === returnData.customerId)) ||
      (sale &&
        customers.find(
          (c) =>
            (sale.customerId && c.id === sale.customerId) ||
            (!!sale.customerName && c.name === sale.customerName),
        )) ||
      null

    const returnTotalAmount = Number(newReturn.total) || 0
    const creditIncrease = returnData.type === "credito" ? returnTotalAmount : 0
    const saleOriginalCreditAmount =
      sale?.status === "credito" ? Math.max(0, Number(sale.total || 0) - Number(sale.amountPaid || 0)) : 0
    const previousReturnedTotal = sale
      ? returns
        .filter((r) => r.invoiceId === sale.id)
        .reduce((sum, r) => sum + (Number(r.total) || 0), 0)
      : 0
    const previousCanceledCredit = Math.min(saleOriginalCreditAmount, previousReturnedTotal)
    const canceledCreditAfterThisReturn = Math.min(saleOriginalCreditAmount, previousReturnedTotal + returnTotalAmount)
    const debtReduction = Math.max(0, canceledCreditAfterThisReturn - previousCanceledCredit)
    const hasCustomerAdjustment = !!returnCustomer && (creditIncrease > 0 || debtReduction > 0)
    const customerSnapshot =
      hasCustomerAdjustment && returnCustomer
        ? {
          id: returnCustomer.id,
          debt: returnCustomer.debt || 0,
          creditBalance: returnCustomer.creditBalance || 0,
        }
        : null

    // 1. Optimistic update
    setReturns((prev) => [newReturn, ...prev])

    // Optimistically update stock
    if (newReturn.returnToInventory) {
      updateLocalStockForItems(newReturn.items, 1)
    }

    // Optimistically update sale status
    if (sale) {
      const totalItemsInSale = sale.items.reduce((sum, item) => sum + item.quantity, 0)
      const allReturns = [...returns, newReturn].filter((r) => r.invoiceId === sale.id)
      const totalReturned = allReturns.reduce(
        (sum, r) => sum + r.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      )
      const newStatus = totalReturned >= totalItemsInSale ? "devuelta_completa" : "devuelta_parcial"
      setSales((prev) =>
        prev.map((s) => (s.id === sale.id ? { ...s, status: newStatus } : s))
      )
    }

    // Optimistically update customer balances (credit balance and debt)
    if (hasCustomerAdjustment && returnCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === returnCustomer.id
            ? {
              ...c,
              debt: Math.max(0, (c.debt || 0) - debtReduction),
              creditBalance: (c.creditBalance || 0) + creditIncrease,
            }
            : c,
        ),
      )
    }

    // Guardar en Supabase
    const supabase = createClient()
    markPendingLocalWrite(newReturn.id)
    const { error } = await supabase.from("returns").insert(
      withTenantPayload({
        id: newReturn.id,
        return_number: newReturn.returnNumber,
        invoice_id: newReturn.invoiceId,
        invoice_number: newReturn.invoiceNumber,
        customer_id: newReturn.customerId,
        customer_name: newReturn.customerName,
        date: newReturn.date,
        items: newReturn.items,
        total: newReturn.total,
        type: newReturn.type,
        reason: newReturn.reason,
        status: newReturn.status,
        new_invoice_id: newReturn.newInvoiceId,
        return_to_inventory: newReturn.returnToInventory,
      }),
    )

    if (error) {
      console.error("Error adding return:", error)
      // Rollback (complex, but doing basic list rollback)
      setReturns((prev) => prev.filter((r) => r.id !== tempId))
      if (newReturn.returnToInventory) {
        updateLocalStockForItems(newReturn.items, -1)
      }
      if (customerSnapshot) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customerSnapshot.id
              ? {
                ...c,
                debt: customerSnapshot.debt,
                creditBalance: customerSnapshot.creditBalance,
              }
              : c,
          ),
        )
      }
      throw error
    }

    // Update DB stocks
    if (newReturn.returnToInventory) {
      try {
        await updateDbStockForItems(supabase, newReturn.items, 1)
      } catch (err) {
        console.error("Error updating stocks after return:", err)
      }
    }

    // Update DB sale status
    if (sale) {
      const totalItemsInSale = sale.items.reduce((sum, item) => sum + item.quantity, 0)
      const allReturns = [...returns, newReturn].filter((r) => r.invoiceId === sale.id)
      const totalReturned = allReturns.reduce(
        (sum, r) => sum + r.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      )
      const newStatus = totalReturned >= totalItemsInSale ? "devuelta_completa" : "devuelta_parcial"
      await runWithInternalCrudBypass(() => updateSale(sale.id, { status: newStatus }))
    }

    // Update DB customer balances
    if (hasCustomerAdjustment && returnCustomer) {
      const customerUpdateData: Record<string, number> = {}
      if (debtReduction > 0) {
        customerUpdateData.debt = Math.max(0, (returnCustomer.debt || 0) - debtReduction)
      }
      if (creditIncrease > 0) {
        customerUpdateData.credit_balance = (returnCustomer.creditBalance || 0) + creditIncrease
      }

      const { error: customerUpdateError } = await withTenantFilter(
        supabase.from("customers").update(customerUpdateData),
      ).eq("id", returnCustomer.id)

      if (customerUpdateError) {
        console.error("Error updating customer balances after return:", customerUpdateError)
      }
    }

    // Update DB almacén customer account balances if this is an almacén sale
    if (sale?.almacenCustomerAccountId) {
      const almacenCustomerAccountId = sale.almacenCustomerAccountId
      if (debtReduction > 0) {
        try {
          // Get current debt from almacen_customer_accounts
          const { data: accountData, error: fetchError } = await withTenantFilter(
            supabase.from("almacen_customer_accounts").select("debt"),
          ).eq("id", almacenCustomerAccountId).single()

          if (fetchError) {
            if (!isMissingTableError(fetchError)) {
              console.error("Error fetching almacen_customer_account:", fetchError)
            }
          } else if (accountData) {
            const currentDebt = Number(accountData.debt || 0)
            const newDebt = Math.max(0, currentDebt - debtReduction)

            const { error: updateError } = await withTenantFilter(
              supabase.from("almacen_customer_accounts").update({ debt: newDebt }),
            ).eq("id", almacenCustomerAccountId)

            if (updateError) {
              if (!isMissingTableError(updateError)) {
                console.error("Error updating almacen_customer_account debt:", updateError)
              }
            }
          }
        } catch (err) {
          console.error("Error updating almacen customer account after return:", err)
        }
      }

      // If this is a credit sale (no payment), remove the credit sale record instead of processing as refund
      const isCreditSaleWithoutPayment = sale && sale.status === "credito" && Number(sale.amountPaid || 0) === 0
      if (isCreditSaleWithoutPayment) {
        try {
          // Remove the credit sale record from almacen_credit_sales
          const { error: deleteCreditSaleError } = await withTenantFilter(
            supabase.from("almacen_credit_sales").delete(),
          ).eq("sale_id", sale.id)

          if (deleteCreditSaleError) {
            if (!isMissingTableError(deleteCreditSaleError)) {
              console.error("Error removing almacen_credit_sales record:", deleteCreditSaleError)
            }
          }
        } catch (err) {
          console.error("Error removing credit sale record after return:", err)
        }
      }
    }

    return newReturn
  }

  const cancelReturn = async (returnId: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "devoluciones")
      throw new Error("Sin permiso para eliminar devoluciones.")
    }

    const returnToCancel = returns.find((r) => r.id === returnId)
    if (!returnToCancel) {
      throw new Error("No se encontro la devolucion a anular.")
    }

    const sale = sales.find((s) => s.id === returnToCancel.invoiceId)
    const shouldAdjustInventory = returnToCancel.returnToInventory !== false
    const pendingProductAdjustments = returnToCancel.items.map((item) => {
      const quantity = Number(item.quantity) || 0
      const resolvedSource = resolveSaleItemSource(item, item.sourceTable)
      const product = resolvedSource
        ? products.find((p) => p.sourceTable === resolvedSource.sourceTable && p.sourceId === resolvedSource.sourceId)
        : products.find((p) => p.id === item.productId)
      return { item, quantity, product, resolvedSource }
    })

    if (shouldAdjustInventory) {
      const insufficientStock = pendingProductAdjustments.filter(
        ({ product, quantity }) => product && product.stock < quantity,
      )

      if (insufficientStock.length > 0) {
        const details = insufficientStock
          .map(
            ({ product, quantity }) =>
              `${product?.name || "Producto"} (stock: ${product?.stock ?? 0}, requiere: ${quantity})`,
          )
          .join(", ")
        throw new Error(`No hay stock suficiente para anular esta devolucion: ${details}.`)
      }
    }

    const returnCustomer =
      (returnToCancel.customerId && customers.find((c) => c.id === returnToCancel.customerId)) ||
      (sale &&
        customers.find(
          (c) =>
            (sale.customerId && c.id === sale.customerId) ||
            (!!sale.customerName && c.name === sale.customerName),
        )) ||
      null

    const returnTotalAmount = Number(returnToCancel.total) || 0
    const creditDecrease = returnToCancel.type === "credito" ? returnTotalAmount : 0
    const saleOriginalCreditAmount =
      sale &&
      (sale.status === "credito" || sale.paymentMethod === "credit" || Number(sale.amountPaid || 0) < Number(sale.total || 0))
        ? Math.max(0, Number(sale.total || 0) - Number(sale.amountPaid || 0))
        : 0

    const returnedTotalBeforeCancel = sale
      ? returns
        .filter((r) => r.invoiceId === sale.id)
        .reduce((sum, r) => sum + (Number(r.total) || 0), 0)
      : 0
    const returnedTotalAfterCancel = Math.max(0, returnedTotalBeforeCancel - returnTotalAmount)
    const canceledCreditBefore = Math.min(saleOriginalCreditAmount, returnedTotalBeforeCancel)
    const canceledCreditAfter = Math.min(saleOriginalCreditAmount, returnedTotalAfterCancel)
    const debtIncrease = Math.max(0, canceledCreditBefore - canceledCreditAfter)
    const hasCustomerAdjustment = !!returnCustomer && (creditDecrease > 0 || debtIncrease > 0)

    const previousReturns = [...returns]
    const previousProducts = [...products]
    const previousSales = [...sales]
    const previousCustomers = [...customers]

    const remainingSaleReturns = sale ? returns.filter((r) => r.invoiceId === sale.id && r.id !== returnToCancel.id) : []
    const recalculatedSaleStatus = sale ? calculateSaleStatusFromReturns(sale, remainingSaleReturns) : null

    setReturns((prev) => prev.filter((r) => r.id !== returnToCancel.id))

    if (shouldAdjustInventory) {
      updateLocalStockForItems(returnToCancel.items, -1)
    }

    if (sale && recalculatedSaleStatus) {
      setSales((prev) => prev.map((s) => (s.id === sale.id ? { ...s, status: recalculatedSaleStatus } : s)))
    }

    if (hasCustomerAdjustment && returnCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === returnCustomer.id
            ? {
              ...c,
              debt: Math.max(0, (c.debt || 0) + debtIncrease),
              creditBalance: Math.max(0, (c.creditBalance || 0) - creditDecrease),
            }
            : c,
        ),
      )
    }

    try {
      const supabase = createClient()
      markPendingLocalWrite(returnToCancel.id)

      const { error: deleteError } = await withTenantFilter(supabase.from("returns").delete()).eq("id", returnToCancel.id)
      if (deleteError) {
        throw deleteError
      }

      if (shouldAdjustInventory) {
        await updateDbStockForItems(supabase, returnToCancel.items, -1)
      }

      if (sale && recalculatedSaleStatus) {
        await runWithInternalCrudBypass(() => updateSale(sale.id, { status: recalculatedSaleStatus }))
      }

      if (hasCustomerAdjustment && returnCustomer) {
        const customerUpdateData: Record<string, number> = {}
        if (debtIncrease > 0) {
          customerUpdateData.debt = Math.max(0, (returnCustomer.debt || 0) + debtIncrease)
        }
        if (creditDecrease > 0) {
          customerUpdateData.credit_balance = Math.max(0, (returnCustomer.creditBalance || 0) - creditDecrease)
        }

        if (Object.keys(customerUpdateData).length > 0) {
          const { error: customerUpdateError } = await withTenantFilter(
            supabase.from("customers").update(customerUpdateData),
          ).eq("id", returnCustomer.id)

          if (customerUpdateError) {
            console.error("Error updating customer balances while canceling return:", customerUpdateError)
          }
        }
      }

      // Update DB almacén customer account balances if this is an almacén sale
      if (sale?.almacenCustomerAccountId) {
        const almacenCustomerAccountId = sale.almacenCustomerAccountId
        if (debtIncrease > 0) {
          try {
            // Get current debt from almacen_customer_accounts
            const { data: accountData, error: fetchError } = await withTenantFilter(
              supabase.from("almacen_customer_accounts").select("debt"),
            ).eq("id", almacenCustomerAccountId).single()

            if (fetchError) {
              if (!isMissingTableError(fetchError)) {
                console.error("Error fetching almacen_customer_account during cancel:", fetchError)
              }
            } else if (accountData) {
              const currentDebt = Number(accountData.debt || 0)
              const newDebt = currentDebt + debtIncrease

              const { error: updateError } = await withTenantFilter(
                supabase.from("almacen_customer_accounts").update({ debt: newDebt }),
              ).eq("id", almacenCustomerAccountId)

              if (updateError) {
                if (!isMissingTableError(updateError)) {
                  console.error("Error updating almacen_customer_account debt during cancel:", updateError)
                }
              }
            }
          } catch (err) {
            console.error("Error updating almacen customer account while canceling return:", err)
          }
        }
      }

      // If this is a credit sale (no payment), restore the credit sale record when canceling return
      const isCreditSaleWithoutPayment = sale && sale.status === "credito" && Number(sale.amountPaid || 0) === 0
      if (isCreditSaleWithoutPayment) {
        try {
          // Re-insert the credit sale record in almacen_credit_sales
          const { error: insertCreditSaleError } = await supabase
            .from("almacen_credit_sales")
            .insert(
              withTenantPayload({
                sale_id: sale.id,
                invoice_number: sale.invoiceNumber,
                date: sale.date,
                customer_account_id: sale.almacenCustomerAccountId,
                customer_name: sale.almacenCustomerName || sale.customerName || null,
                items: sale.items,
                total: sale.total,
                amount_paid: 0,
                credit_amount: sale.total,
                payment_method: sale.paymentMethod,
                status: "credito",
                notes: "Restaurado después de cancelar devolución",
              }),
            )

          if (insertCreditSaleError) {
            if (!isMissingTableError(insertCreditSaleError)) {
              console.error("Error restoring almacen_credit_sales record:", insertCreditSaleError)
            }
          }
        } catch (err) {
          console.error("Error restoring credit sale record while canceling return:", err)
        }
      }
    } catch (error) {
      console.error("Error canceling return:", error)
      setReturns(previousReturns)
      setProducts(previousProducts)
      setSales(previousSales)
      setCustomers(previousCustomers)
      throw error
    }
  }

  const archiveRepair = async (repair: Repair) => {
    try {
      const supabase = createClient()
      const historyData = {
        ...repair,
        id: undefined,
        originalRepairId: undefined,
        archivedAt: undefined,
      }
      const historyPayload = withTenantPayload({
        original_repair_id: repair.id,
        repair_number: repair.repair_number || null,
        client: repair.client || "Cliente",
        customer_phone: repair.customerPhone || repair.whatsapp || null,
        cedula: repair.cedula || null,
        device: repair.device || "",
        repair_date: repair.date || new Date().toISOString(),
        repair_data: historyData,
        archived_at: new Date().toISOString(),
      })

      // Evita depender de ON CONFLICT sobre un índice parcial. Así funciona
      // también en instalaciones que ya tenían la primera versión del índice.
      const { data: existingHistory, error: lookupError } = await withTenantFilter(
        supabase.from("repair_history").select("id").eq("original_repair_id", repair.id).maybeSingle(),
      )
      if (lookupError) throw lookupError

      const historyQuery = existingHistory?.id
        ? withTenantFilter(supabase.from("repair_history").update(historyPayload)).eq("id", existingHistory.id)
        : supabase.from("repair_history").insert(historyPayload)
      const { data, error } = await historyQuery.select().single()

      if (error) {
        if (isMissingTableError(error)) {
          markMissingTable("repair_history")
          console.warn("[v0] Repair history table is not installed yet:", error.message)
          return
        }
        throw error
      }
      if (data) {
        const mapped = mapRepairHistoryFromDB(data)
        setRepairHistory((prev) => [mapped, ...prev.filter((item) => item.originalRepairId !== repair.id)])
      }
    } catch (error) {
      console.error("[v0] Could not archive repair:", error)
      throw error
    }
  }

  const addRepair = async (repair: Omit<Repair, "id" | "date">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("reparaciones")
      throw new Error("Sin permiso para agregar reparaciones.")
    }

    try {
      const supabase = createClient()
      // Generar un repair/ticket id único con formato TIC-######
      const repairNumber = await generateTicketId(supabase)

      // Ensure we have a valid date
      const repairDate = new Date()
      const dateStr = repairDate.toISOString()
      const tempId = generateUUID()

      const resolvedTechnician = repair.technician?.trim() || currentUser?.name || "Sistema"

      const newRepair: Repair = {
        ...repair,
        technician: resolvedTechnician,
        id: tempId,
        repair_number: repairNumber,
        date: dateStr,
      }

      const repairMetadata = {
        issue: repair.issue,
        customerPhone: repair.customerPhone,
        whatsapp: repair.whatsapp,
        cedula: repair.cedula,
        brand: repair.brand,
        model: repair.model,
        imei: repair.imei,
        color: repair.color,
        unlockPattern: repair.unlockPattern,
        visualNotes: repair.visualNotes,
        technicianNotes: repair.technicianNotes,
        checklist: repair.checklist,
        deposit: repair.deposit,
        pendingBalance: repair.pendingBalance,
        technician: resolvedTechnician,
        createdByEmployeeId: currentUser?.id,
        createdByEmployeeName: currentUser?.name,
        statusHistory: [
          {
            toStatus: repair.status || "recibido",
            changedAt: dateStr,
            changedByEmployeeId: currentUser?.id,
            changedByEmployeeName: currentUser?.name,
          },
        ],
        serviceItems: repair.serviceItems,
      }

      const { data, error } = await supabase
        .from("repairs")
        .insert(
          withTenantPayload({
            id: tempId,
            repair_number: repairNumber,
            client: repair.client,
            device: repair.device,
            issue: repair.issue,
            status: repair.status || "recibido",
            type: repair.type,
            cost: Number.parseFloat(repair.cost) || 0,
            password: repair.password || null,
            technician_notes: repair.technicianNotes || null,
            date: dateStr,
            notes: JSON.stringify(repairMetadata),
          }),
        )
        .select()
        .single()

      if (error) {
        console.error("[v0] Error adding repair:", error)
        throw error
      }

      let mappedFromDb: Repair | null = null
      if (data) {
        markPendingLocalWrite(data.id)
        mappedFromDb = { ...newRepair, ...mapRepairFromDB(data) }
      }
      if (repair.serviceItems?.length) {
        const { error: serviceError } = await supabase.from("repair_services").insert(
          repair.serviceItems.map((item, index) => withTenantPayload({
            repair_id: tempId,
            name: item.name,
            piece_cost: item.pieceCost,
            charge: item.charge,
            sort_order: index,
          })),
        )
        if (serviceError) {
          await withTenantFilter(supabase.from("repairs").delete()).eq("id", tempId)
          throw new Error(`No se pudo guardar el detalle de servicios en Supabase: ${serviceError.message}`)
        }
      }
      await archiveRepair(mappedFromDb || newRepair)
      if (mappedFromDb) {
        setRepairs((prev) => {
          const current = mappedFromDb as Repair
          const existingIndex = prev.findIndex((repairItem) =>
            repairItem.id === current.id ||
            Boolean(current.repair_number && repairItem.repair_number === current.repair_number),
          )
          if (existingIndex === -1) return [current, ...prev]
          return prev.map((repairItem, index) => (index === existingIndex ? current : repairItem))
        })
      }
      return tempId
    } catch (error) {
      console.error("[v0] Error adding repair:", error)
      throw error
    }
  }

  const updateRepair = async (id: string, updatedRepair: Partial<Repair>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "reparaciones")
      throw new Error("Sin permiso para editar reparaciones.")
    }

    const previousRepairs = [...repairs]

    try {
      const supabase = createClient()
      const existing = previousRepairs.find((r) => r.id === id)
      const merged = { ...existing, ...updatedRepair }

      const updateData: Record<string, unknown> = {}

      if (updatedRepair.client !== undefined) updateData.client = updatedRepair.client
      if (updatedRepair.device !== undefined) updateData.device = updatedRepair.device
      if (updatedRepair.issue !== undefined) updateData.issue = updatedRepair.issue
      if (updatedRepair.status !== undefined) updateData.status = updatedRepair.status
      if (updatedRepair.type !== undefined) updateData.type = updatedRepair.type
      if (updatedRepair.cost !== undefined) updateData.cost = Number.parseFloat(updatedRepair.cost)
      if (updatedRepair.password !== undefined) updateData.password = updatedRepair.password
      if (updatedRepair.technicianNotes !== undefined) updateData.technician_notes = updatedRepair.technicianNotes
      if (updatedRepair.ticket_pdf_url !== undefined) updateData.ticket_pdf_url = updatedRepair.ticket_pdf_url

      const statusHistory = existing?.statusHistory ? [...existing.statusHistory] : []
      if (updatedRepair.status !== undefined && existing && updatedRepair.status !== existing.status) {
        statusHistory.push({
          fromStatus: existing.status,
          toStatus: updatedRepair.status,
          changedAt: new Date().toISOString(),
          changedByEmployeeId: currentUser?.id,
          changedByEmployeeName: currentUser?.name,
        })
      }

      const repairMetadata = {
        issue: merged.issue,
        customerPhone: merged.customerPhone,
        whatsapp: merged.whatsapp,
        cedula: merged.cedula,
        brand: merged.brand,
        model: merged.model,
        imei: merged.imei,
        color: merged.color,
        unlockPattern: merged.unlockPattern,
        visualNotes: merged.visualNotes,
        technicianNotes: merged.technicianNotes,
        checklist: merged.checklist,
        deposit: merged.deposit,
        pendingBalance: merged.pendingBalance,
        technician: merged.technician,
        statusHistory,
        createdByEmployeeId: existing?.createdByEmployeeId,
        createdByEmployeeName: existing?.createdByEmployeeName,
        serviceItems: merged.serviceItems,
      }

      updateData.notes = JSON.stringify(repairMetadata)

      console.debug("updateRepair payload:", { id, updateData })
      const { error } = await withTenantFilter(supabase.from("repairs").update(updateData)).eq("id", id)

      if (error) {
        console.error("Error updating repair:", error, { id, updateData })
        throw new Error(error.message || "Error actualizando la reparación.")
      }
      if (updatedRepair.serviceItems !== undefined) {
        const { error: deleteServicesError } = await withTenantFilter(
          supabase.from("repair_services").delete(),
        ).eq("repair_id", id)
        if (deleteServicesError) {
          throw deleteServicesError
        } else if (updatedRepair.serviceItems.length > 0) {
          const { error: insertServicesError } = await supabase.from("repair_services").insert(
            updatedRepair.serviceItems.map((item, index) => withTenantPayload({
              repair_id: id,
              name: item.name,
              piece_cost: item.pieceCost,
              charge: item.charge,
              sort_order: index,
            })),
          )
          if (insertServicesError) throw insertServicesError
        }
      }
      await archiveRepair({ ...merged, id } as Repair)
      setRepairs((prev) => prev.map((repair) => (repair.id === id ? { ...repair, ...updatedRepair } : repair)))
    } catch (error) {
      console.error("Error updating repair:", error)
      // Supabase es la fuente de verdad; no se conserva un cambio local fallido.
      setRepairs(previousRepairs)
      throw error
    }
  }

  const deleteRepair = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "reparaciones")
      throw new Error("Sin permiso para eliminar reparaciones.")
    }

    const previousRepairs = [...repairs]

    try {
      const supabase = createClient()
      const repairToArchive = previousRepairs.find((repair) => repair.id === id)
      if (repairToArchive) await archiveRepair(repairToArchive)
      const { error } = await withTenantFilter(supabase.from("repairs").delete()).eq("id", id)

      if (error) {
        console.error("Error deleting repair:", error)
        throw error
      }
      setRepairs((prev) => prev.filter((repair) => repair.id !== id))
    } catch (error) {
      console.error("Error deleting repair:", error)
      setRepairs(previousRepairs)
      throw error
    }
  }

  const setOnDialogOpen = useCallback((callback: () => void) => {
    setOnDialogOpenCallback(() => callback)
  }, [])

  const login = useCallback(
    async (
      usernameOrEmail: string,
      password: string,
    ): Promise<{ success: boolean; role?: "admin" | "employee"; message?: string }> => {
      const input = usernameOrEmail.trim().toLowerCase()
      const safePassword = password.trim()

      if (!input || !safePassword) {
        return { success: false, message: "Por favor complete usuario y contrasena" }
      }

      try {
        console.log("Attempting login for:", input) // Debug log
          const supabase = createClient()

        const activeQuery = supabase
          .from("employees")
          .select("*")
          .eq("status", "active")

        const query = input.includes("@")
          ? activeQuery.ilike("email", input)
          : activeQuery.ilike("email", `${input}@%`)

        const { data, error } = await query.limit(2)

        console.log("Login result:", { data, error })

        if (error) {
          if (isAuthError(error)) {
            return {
              success: false,
              message: "Clave de Supabase inválida o no permitida para este origen.",
            }
          }
          if (isNetworkError(error)) {
            return { success: false, message: "No se pudo conectar a Supabase. Verifica tu conexión a internet." }
          }
          if (isRLSError(error)) {
            return {
              success: false,
              message: "Permiso denegado al leer empleados. Revisa las políticas RLS.",
            }
          }
          return { success: false, message: "No se pudo validar el usuario. Intente nuevamente." }
        }

        if (!data || data.length === 0) {
          const inactiveQuery = supabase
            .from("employees")
            .select("*")
            .eq("status", "inactive")

          const inactiveLookup = input.includes("@")
            ? inactiveQuery.ilike("email", input)
            : inactiveQuery.ilike("email", `${input}@%`)

          const { data: inactiveData } = await inactiveLookup.limit(1)
          if (inactiveData && inactiveData.length > 0) {
            return {
              success: false,
              message: "La cuenta está inactiva. Contacta al administrador para reactivarla.",
            }
          }

          return { success: false, message: "Usuario o contrasena incorrectos" }
        }

        if (!input.includes("@") && data.length > 1) {
          return {
            success: false,
            message: "Hay mas de un usuario con ese nombre. Use el correo completo.",
          }
        }

        const user = data[0]
        const storedPassword = typeof user.password === "string" ? user.password.trim() : ""
        if (storedPassword !== safePassword) {
          return { success: false, message: "Usuario o contrasena incorrectos" }
        }
        const isSuperAdmin = user.role === "super_admin"
        const tenantRole: "super_admin" | "admin" | "employee" = isSuperAdmin
          ? "super_admin"
          : user.role === "admin"
            ? "admin"
            : "employee"
        const normalizedRole = tenantRole
        const ownerAdminId =
          typeof user.owner_admin_id === "string" && user.owner_admin_id.trim().length > 0
            ? user.owner_admin_id.trim()
            : tenantRole === "employee"
              ? ""
              : String(user.id || "")
        const adminId = tenantRole === "employee" ? ownerAdminId : String(user.id || "")

        if (!adminId) {
          return {
            success: false,
            message: "Este usuario no tiene tenant asignado (owner_admin_id).",
          }
        }

        const normalizedPermissions = normalizeEmployeePermissions(user.permissions)
        const sessionUser = {
          id: String(user.id),
          role: normalizedRole,
          tenantRole,
          ownerAdminId: ownerAdminId || String(user.id),
          adminId,
          name: user.name,
          email: user.email,
          permissions: normalizedPermissions,
        }

        setCurrentUser(sessionUser)
        if (sessionUser.adminId) {
          void getTenantBranding(sessionUser.adminId)
        }

        try {
          localStorage.setItem('current_user', JSON.stringify(sessionUser))
        } catch (err) {
          console.warn('Unable to persist current_user to localStorage:', err)
        }
        return { success: true, role: normalizedRole }
      } catch (err) {
        console.error("Login error:", err)
        if (isNetworkError(err)) {
          return { success: false, message: "No se pudo conectar a Supabase. Verifica tu conexión a internet." }
        }
        if (isAuthError(err)) {
          return { success: false, message: "Clave de Supabase inválida. Verifica tu configuración." }
        }
        return { success: false, message: getSupabaseErrorMessage(err, "inicio de sesión") }
      }
    },
    [],
  )
  const logout = useCallback(() => {
    setCurrentUser(null)
    try {
      localStorage.removeItem('current_user')
    } catch (err) {
      console.error('Error clearing current_user from localStorage:', err)
    }
  }, [])

  const addEmployee = async (employee: Omit<Employee, "id">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyCrudPermissionDenied("agregar", "empleados")
      throw new Error("Sin permiso para agregar empleados.")
    }

    if (!currentUser) {
      throw new Error("Debe iniciar sesión para crear empleados.")
    }

    if (employee.role === "super_admin") {
      throw new Error("La creación de super administradores está bloqueada desde la aplicación.")
    }

    if (employee.role === "admin" && currentUser.role !== "admin") {
      throw new Error("Solo los administradores pueden crear nuevos administradores.")
    }

    const tempId = generateUUID()
    const normalizedEmail = employee.email.trim().toLowerCase()
    const sanitizedPassword = employee.password.trim()
    const normalizedPermissions = normalizeEmployeePermissions(employee.permissions)
    const ownerAdminIdForNewUser = employee.role === "admin" ? tempId : currentUser.adminId
    const newEmployeeOptimistic: Employee = {
      ...employee,
      email: normalizedEmail,
      password: sanitizedPassword,
      id: tempId,
      ownerAdminId: ownerAdminIdForNewUser,
      phone: employee.phone || "",
      address: employee.address || "",
      salary: employee.salary || 0,
      permissions: normalizedPermissions,
    }

    // 1. Optimistic update
    setEmployees((prev) => [...prev, newEmployeeOptimistic])

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("employees")
        .insert({
          id: tempId,
          name: employee.name,
          email: normalizedEmail,
          password: sanitizedPassword,
          phone: employee.phone,
          role: employee.role,
          owner_admin_id: ownerAdminIdForNewUser,
          cedula: employee.cedula,
          address: employee.address,
          hire_date: employee.hireDate,
          salary: employee.salary,
          status: employee.status,
          permissions: normalizedPermissions,
        })
        .select()
        .single()

      if (error) {
        console.error("Error adding employee:", error)
        // Rollback
        setEmployees((prev) => prev.filter((e) => e.id !== tempId))
        throw new Error(error.message || "Error al agregar el empleado")
      }

      if (data) {
        markPendingLocalWrite(data.id)
        // Update with actual data if needed (e.g. if DB generates something)
        const mapped = mapEmployeeFromDB(data)
        setEmployees((prev) => prev.map((e) => (e.id === tempId ? mapped : e)))
      }
    } catch (error) {
      console.error("Error adding employee:", error)
      setEmployees((prev) => prev.filter((e) => e.id !== tempId))
      throw error
    }
  }

  const updateEmployee = async (id: string, employee: Partial<Employee>) => {
    if (!canCurrentUserPerform("canEdit")) {
      notifyCrudPermissionDenied("editar", "empleados")
      throw new Error("Sin permiso para editar empleados.")
    }

    if (!currentUser) {
      throw new Error("Debe iniciar sesión para actualizar empleados.")
    }

    if (employee.role === "admin" && currentUser.role !== "admin") {
      throw new Error("Solo los administradores pueden promover empleados a administrador.")
    }

    if (employee.role === "super_admin") {
      throw new Error("El rol de super administrador ya no está disponible en esta versión.")
    }

    const previousEmployees = [...employees]
    const previousEmployee = employees.find((item) => item.id === id)

    const normalizedUpdate: Partial<Employee> = { ...employee }
    if (employee.email !== undefined) normalizedUpdate.email = employee.email.trim().toLowerCase()
    if (employee.password !== undefined) normalizedUpdate.password = employee.password.trim()
    if (employee.permissions !== undefined) normalizedUpdate.permissions = normalizeEmployeePermissions(employee.permissions)

    // Optimistic update
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...normalizedUpdate } : e)))

    try {
      const supabase = createClient()
      const updateData: any = {}

      if (normalizedUpdate.name !== undefined) updateData.name = normalizedUpdate.name
      if (normalizedUpdate.email !== undefined) updateData.email = normalizedUpdate.email
      if (normalizedUpdate.password !== undefined) updateData.password = normalizedUpdate.password
      if (normalizedUpdate.phone !== undefined) updateData.phone = normalizedUpdate.phone
      if (normalizedUpdate.role !== undefined) updateData.role = normalizedUpdate.role
      if (normalizedUpdate.cedula !== undefined) updateData.cedula = normalizedUpdate.cedula
      if (normalizedUpdate.address !== undefined) updateData.address = normalizedUpdate.address
      if (normalizedUpdate.hireDate !== undefined) updateData.hire_date = normalizedUpdate.hireDate
      if (normalizedUpdate.salary !== undefined) updateData.salary = normalizedUpdate.salary
      if (normalizedUpdate.status !== undefined) updateData.status = normalizedUpdate.status
      if (normalizedUpdate.permissions !== undefined) updateData.permissions = normalizedUpdate.permissions
      if (normalizedUpdate.role === "admin") updateData.owner_admin_id = id
      if (normalizedUpdate.role === "employee") {
        updateData.owner_admin_id = previousEmployee?.ownerAdminId || currentUser.adminId
      }

      updateData.updated_at = new Date().toISOString()

      const updateQuery = supabase.from("employees").update(updateData).eq("id", id).eq("owner_admin_id", currentUser.adminId)

      const { error } = await updateQuery

      if (error) {
        console.error("Error updating employee:", error)
        setEmployees(previousEmployees)
        throw new Error(error.message || "Error al actualizar el empleado")
      }

      if (currentUser?.id === id && normalizedUpdate) {
        const updatedCurrentUser = {
          ...currentUser,
          name: normalizedUpdate.name ?? currentUser.name,
          email: normalizedUpdate.email ?? currentUser.email,
          permissions: normalizedUpdate.permissions ?? currentUser.permissions,
        }

        setCurrentUser(updatedCurrentUser)
        try {
          localStorage.setItem('current_user', JSON.stringify(updatedCurrentUser))
        } catch (err) {
          console.warn('Unable to persist current_user to localStorage:', err)
        }
      }
    } catch (error) {
      console.error("Error updating employee:", error)
      setEmployees(previousEmployees)
      throw error
    }
  }

  const deleteEmployee = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "empleados")
      throw new Error("Sin permiso para eliminar empleados.")
    }

    if (!currentUser) {
      throw new Error("Debe iniciar sesión para eliminar empleados.")
    }

    const previousEmployees = [...employees]

    // Optimistic delete
    setEmployees((prev) => prev.filter((e) => e.id !== id))

    try {
      const supabase = createClient()
      const deleteQuery = supabase.from("employees").delete().eq("id", id).eq("owner_admin_id", currentUser.adminId)

      const { error } = await deleteQuery

      if (error) {
        console.error("Error deleting employee:", error)
        setEmployees(previousEmployees)
        throw new Error(error.message || "Error al eliminar el empleado")
      }
    } catch (error) {
      console.error("Error deleting employee:", error)
      setEmployees(previousEmployees)
      throw error
    }
  }

  const addManualSale = (
    saleData: Omit<Sale, "id" | "invoiceNumber" | "date" | "items"> & { manualItems: ManualInvoiceItem[] },
  ) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("ventas manuales")
      throw new Error("Sin permiso para agregar ventas manuales.")
    }

    const { manualItems, ...rest } = saleData

    const items: CartItem[] = manualItems.map((item) => ({
      id: buildSourceRuntimeId("manual", item.id),
      cartId: buildSourceRuntimeId("manual", item.id),
      sourceTable: "manual",
      sourceId: String(item.id),
      sku: "MANUAL",
      name: item.description,
      category: "manual",
      stock: 0,
      minStock: 0,
      buyPrice: 0,
      wholesalePrice: 0,
      sellPrice: item.price,
      supplier: "",
      quantity: item.quantity,
    }))

    const newSaleTotal = items.reduce((sum, item) => sum + item.quantity * item.sellPrice, 0)

    const newSale: Sale = {
      ...rest,
      id: generateUUID(), // Using generateUUID instead of crypto.randomUUID()
      invoiceNumber: generateInvoiceNumber(),
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      items,
      subtotal: newSaleTotal,
      tax: 0,
      total: newSaleTotal,
      status: "completada",
    }

    // Guardar en Supabase
    const supabase = createClient()
    insertSaleRecord(supabase, newSale)
      .then(({ error }) => {
        if (error) console.error("Error adding manual sale to Supabase:", error)
      })

    setSales((prev) => [newSale, ...prev])
    return newSale
  }

  const addExpense = async (expense: Omit<Expense, "id">) => {
    if (!canCurrentUserPerform("canAdd")) {
      notifyAddPermissionDenied("gastos")
      throw new Error("Sin permiso para agregar gastos.")
    }

    const tempId = generateUUID()
    const resolvedUserId = expense.userId || currentUser?.id
    const resolvedUserName = expense.userName || currentUser?.name || "Sistema"

    const newExpense: Expense = {
      ...expense,
      userId: resolvedUserId,
      userName: resolvedUserName,
      id: tempId,
      amount: Number(expense.amount) || 0,
      createdAt: new Date().toISOString(),
    }

    // 1. Optimistic update
    setExpenses((prev) => [newExpense, ...prev])

    const supabase = createClient()
    const { data, error } = await supabase
      .from("expenses")
      .insert(
        withTenantPayload({
          id: tempId,
          date: expense.date,
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
          payment_method: expense.paymentMethod,
          user_name: resolvedUserName,
          user_id: resolvedUserId,
        }),
      )
      .select()
      .single()

    if (error) {
      console.error("Error adding expense:", error)
      // Rollback
      setExpenses((prev) => prev.filter((e) => e.id !== tempId))
      throw error
    }

    if (data) {
      markPendingLocalWrite(data.id)
      setExpenses((prev) => prev.map((e) => (e.id === tempId ? mapExpenseFromDB(data) : e)))
    }
  }

  const deleteExpense = async (id: string) => {
    if (!canCurrentUserPerform("canDelete")) {
      notifyCrudPermissionDenied("eliminar", "gastos")
      throw new Error("Sin permiso para eliminar gastos.")
    }

    const previousExpenses = [...expenses]

    // Optimistic delete
    setExpenses((prev) => prev.filter((e) => e.id !== id))

    try {
      const supabase = createClient()
      const { error } = await withTenantFilter(supabase.from("expenses").delete()).eq("id", id)

      if (error) {
        console.error("Error deleting expense:", error)
        // Rollback
        setExpenses(previousExpenses)
        throw error
      }
    } catch (error) {
      console.error("Error deleting expense:", error)
      setExpenses(previousExpenses)
    }
  }

  function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  return (
    <StoreContext.Provider
      value={{
        products,
        sales,
        suppliers,
        customers,
        payments,
        paymentAllocations,
        createAlmacenSale,
        repairs,
        repairHistory,
        purchases,
        supplierPayments,
        returns,
        employees,
        cart,
        setCart,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        updateCartItemPrice,
        clearCart,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addPayment,
        deletePayment,
        addPurchase,
        updatePurchase,
        addSupplierPayment,
        addReturn,
        cancelReturn,
        getReturnsByInvoice,
        getReturnedQuantity,
        onDialogOpen: onDialogOpenCallback,
        setOnDialogOpen,
        currentTab,
        setCurrentTab,
        addProduct,
        updateProduct,
        deleteProduct,
        addSale,
        updateSale,
        deleteSale,
        addRepair,
        updateRepair,
        deleteRepair,
        archiveRepair,
        showManualInvoiceDialog,
        setShowManualInvoiceDialog,
        addManualSale,
        currentUser,
        canCurrentUserPerform,
        isTableMissing,
        login,
        logout,
        isAuthenticated: !!currentUser,
        isInitializing,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        expenses,
        addExpense,
        deleteExpense,
        refreshData,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider")
  }
  return context
}
