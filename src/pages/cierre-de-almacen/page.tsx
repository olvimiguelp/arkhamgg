"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  CheckCircle2,
  Coins,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  Home,
  Lock,
  PieChartIcon,
  Receipt,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  User,
  Wallet,
  Warehouse,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRealtimeTableRefresh } from "@/hooks/use-realtime-table-refresh"
import { useStore, type Return, type Sale } from "@/components/store-context"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import {
  normalizeAlmacenBoxNumber,
  getAlmacenCategoryLabel,
  formatAlmacenSku,
  isAlmacenCategory,
} from "@/lib/almacen"
import { buildSourceRuntimeId, isAlmacenSourceRecord, normalizeInventorySourceTable } from "@/lib/transaction-classification"
import {
  generateAlmacenClosingPDF,
  generateAlmacenClosingNumber,
  type AlmacenClosingFinancialSummary,
  type AlmacenClosingSnapshotItem,
} from "@/lib/almacen-closing-pdf"
import { printAlmacenClosingTicket } from "@/components/invoice-printer"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts"

interface AlmacenClosing {
  id: string
  closing_number: string
  date: string
  cashier_id?: string
  cashier_name: string
  total_products: number
  total_units_expected: number
  total_units_counted: number
  discrepancy_units: number
  total_cost_expected: number
  total_cost_counted: number
  discrepancy_cost: number
  status: string
  notes?: string
  snapshot: AlmacenClosingSnapshotItem[] | string | null
  created_at: string
}

interface AlmacenDebtPaymentRecord {
  id: string
  date: string
  amount: number
  payment_method: "cash" | "card" | "transfer" | "credit"
  customer_account_id?: string
  credit_sale_id?: string
  related_invoice_number?: string
  invoice_number?: string
  previous_debt?: number
  remaining_debt?: number
  createdByEmployeeId?: string
}

const COLORS = {
  cash: "#22c55e",
  card: "#3b82f6",
  transfer: "#8b5cf6",
  credit: "#f59e0b",
}

const parseCountedStockValue = (value: string | undefined, fallback: number) => {
  if (value === undefined || value === "") return Math.max(0, fallback)
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return Math.max(0, fallback)
  return parsed
}

const normalizeSnapshot = (snapshot: AlmacenClosing["snapshot"]): AlmacenClosingSnapshotItem[] => {
  if (Array.isArray(snapshot)) return snapshot
  if (typeof snapshot !== "string" || !snapshot.trim()) return []

  try {
    const parsed = JSON.parse(snapshot)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

type PaymentMethodKey = keyof typeof COLORS

type MethodBreakdown = Record<PaymentMethodKey, number>

type MethodTotals = Record<
  PaymentMethodKey,
  {
    sales: number
    returns: number
    payments: number
    repairs: number
    expenses: number
  }
>

type AlmacenSaleMetric = Sale & {
  almacenTotal: number
  almacenMethodBreakdown: MethodBreakdown
}

type AlmacenReturnMetric = Return & {
  almacenTotal: number
  almacenMethodBreakdown: MethodBreakdown
}

const createEmptyMethodBreakdown = (): MethodBreakdown => ({
  cash: 0,
  card: 0,
  transfer: 0,
  credit: 0,
})

const createEmptyMethodTotals = (): MethodTotals => ({
  cash: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
  card: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
  transfer: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
  credit: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
})

const normalizeAmount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizePositiveAmount = (value: unknown) => Math.max(0, normalizeAmount(value))

const normalizeMethodToken = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()

const normalizePaymentMethod = (value?: string | null): PaymentMethodKey => {
  const method = normalizeMethodToken(value)

  if (["cash", "efectivo", "contado"].includes(method)) return "cash"
  if (["card", "tarjeta", "debito", "credito-tarjeta"].includes(method)) return "card"
  if (["transfer", "transferencia", "transf", "transferencias", "trafecia"].includes(method)) return "transfer"
  if (["credit", "credito", "fiado"].includes(method)) return "credit"

  return "cash"
}

const getItemId = (item?: Record<string, unknown> | null) => {
  const rawId = item?.productId ?? item?.id
  if (typeof rawId === "string" && rawId.trim()) return rawId.trim()
  if (typeof rawId === "number" && Number.isFinite(rawId)) return String(rawId)
  return null
}

const getItemName = (item?: Record<string, unknown> | null) => {
  const rawName = item?.productName ?? item?.name
  return typeof rawName === "string" && rawName.trim() ? rawName.trim().toLowerCase() : null
}

const getItemSubtotal = (item?: Record<string, unknown> | null) => {
  if (!item) return 0
  const subtotal = normalizePositiveAmount(item.subtotal)
  if (subtotal > 0) return subtotal
  const quantity = normalizePositiveAmount(item.quantity)
  const unitPrice = normalizeAmount(item.customPrice ?? item.sellPrice ?? item.price ?? item.unitPrice ?? 0)
  return Math.max(0, quantity * unitPrice)
}

const isAlmacenItemRecord = (
  item: Record<string, unknown> | null | undefined,
  almacenProductIds: Set<string>,
) => {
  if (!item) return false
  if (isAlmacenSourceRecord(item, almacenProductIds)) return true

  const itemId = getItemId(item)
  if (itemId && almacenProductIds.has(itemId)) return true

  const rawBoxNumber = item.boxNumber ?? item.box_number
  if (normalizeAlmacenBoxNumber(rawBoxNumber == null ? undefined : String(rawBoxNumber))) return true

  const rawCategory = item.category ?? item.productCategory ?? item.product_category
  if (isAlmacenCategory(rawCategory == null ? undefined : String(rawCategory))) return true

  return false
}

const calculateSaleMethodBreakdown = (sale: Sale): MethodBreakdown => {
  const totals = createEmptyMethodBreakdown()
  const saleTotal = normalizePositiveAmount(sale.total)
  if (saleTotal <= 0) return totals

  const method = normalizePaymentMethod(sale.paymentMethod)
  const amountPaid = Math.min(saleTotal, normalizePositiveAmount(sale.amountPaid))
  const hasSplitCredit = method !== "credit" && amountPaid > 0 && amountPaid < saleTotal

  if (method === "credit") {
    totals.credit = saleTotal
    return totals
  }

  if (hasSplitCredit) {
    totals[method] = amountPaid
    totals.credit = saleTotal - amountPaid
    return totals
  }

  totals[method] = saleTotal
  return totals
}

const scaleMethodBreakdown = (totals: MethodBreakdown, ratio: number): MethodBreakdown => {
  const safeRatio = Math.max(0, Math.min(1, ratio))
  return {
    cash: totals.cash * safeRatio,
    card: totals.card * safeRatio,
    transfer: totals.transfer * safeRatio,
    credit: totals.credit * safeRatio,
  }
}

const sumMethodBreakdown = (totals: MethodBreakdown) => totals.cash + totals.card + totals.transfer + totals.credit

const findMatchingSaleItemForReturn = (sale: Sale | undefined, returnItem: Record<string, unknown>) => {
  if (!sale || !Array.isArray(sale.items)) return undefined

  const returnItemId = getItemId(returnItem)
  if (returnItemId) {
    const byId = sale.items.find((item) => getItemId(item as unknown as Record<string, unknown>) === returnItemId)
    if (byId) return byId as unknown as Record<string, unknown>
  }

  const returnName = getItemName(returnItem)
  if (!returnName) return undefined

  const byName = sale.items.find((item) => getItemName(item as unknown as Record<string, unknown>) === returnName)
  return byName as unknown as Record<string, unknown> | undefined
}

const isMissingTableError = (error: unknown) => {
  const err = error as { code?: string; status?: number; message?: string }
  const message = String(err?.message ?? "").toLowerCase()
  return (
    err?.code === "PGRST205" ||
    err?.status === 404 ||
    message.includes("could not find the table")
  )
}

export default function AlmacenClosingPage() {
  const { products, sales, returns, payments, repairs, expenses, currentUser, employees, refreshData, customers } = useStore()
  const { toast } = useToast()
  const supabase = createClient()

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [showClosingDialog, setShowClosingDialog] = useState(false)
  const [closingNotes, setClosingNotes] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState("resumen")
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterHour, setFilterHour] = useState("all")
  const [openingBalance, setOpeningBalance] = useState("0")
  const [manualCountedAmount, setManualCountedAmount] = useState("")
  const [startTime] = useState(new Date())
  const [countedStockByProduct, setCountedStockByProduct] = useState<Record<string, string>>({})
  const [almacenClosings, setAlmacenClosings] = useState<AlmacenClosing[]>([])
  const [almacenDebtPayments, setAlmacenDebtPayments] = useState<AlmacenDebtPaymentRecord[]>([])
  const [almacenCustomerNamesById, setAlmacenCustomerNamesById] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [almacenProductIds, setAlmacenProductIds] = useState<Set<string>>(new Set())

  const [currentDay, setCurrentDay] = useState<string>(new Date().getDate().toString())
  const [currentMonth, setCurrentMonth] = useState<string>((new Date().getMonth() + 1).toString())
  const [currentYear, setCurrentYear] = useState<string>(new Date().getFullYear().toString())
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all")
  const [selectedPayment, setSelectedPayment] = useState<AlmacenDebtPaymentRecord | null>(null)

  const isAdmin = currentUser?.role === "admin"
  const effectiveEmployeeFilter = isAdmin ? selectedEmployeeId : currentUser?.id ?? "all"

  const employeeOptions = useMemo(
    () => employees
      .filter((employee) => employee.role === "employee" || employee.role === "admin")
      .map((employee) => ({ id: employee.id, name: employee.name })),
    [employees],
  )

  useEffect(() => {
    const monthStr = currentMonth.padStart(2, "0")
    const dayStr = currentDay.padStart(2, "0")
    setSelectedDate(`${currentYear}-${monthStr}-${dayStr}`)
  }, [currentDay, currentMonth, currentYear])

  useEffect(() => {
    if (!isAdmin && currentUser?.id) {
      setSelectedEmployeeId(currentUser.id)
    }
  }, [isAdmin, currentUser?.id])

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const yearsArray = []
    for (let i = current - 5; i <= current + 1; i++) yearsArray.push(i.toString())
    return yearsArray.reverse()
  }, [])

  const months = useMemo(
    () => [
      { value: "1", label: "Enero" },
      { value: "2", label: "Febrero" },
      { value: "3", label: "Marzo" },
      { value: "4", label: "Abril" },
      { value: "5", label: "Mayo" },
      { value: "6", label: "Junio" },
      { value: "7", label: "Julio" },
      { value: "8", label: "Agosto" },
      { value: "9", label: "Septiembre" },
      { value: "10", label: "Octubre" },
      { value: "11", label: "Noviembre" },
      { value: "12", label: "Diciembre" },
    ],
    [],
  )

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => (i + 1).toString()), [])

  const hasAccess = (() => {
    if (!currentUser) return false
    if (currentUser.role === "admin") return true
    if (currentUser.role === "employee") {
      const employee = employees.find((e) => e.email === currentUser.email)
      return employee?.permissions?.almacenClosing === true
    }
    return false
  })()

  useEffect(() => {
    const inferredIds = products
      .filter((product) => {
        const explicitSource = normalizeInventorySourceTable(product.sourceTable)
        if (explicitSource) return explicitSource === "armacen"
        return Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category))
      })
      .map((product) => String(product.id))

    if (inferredIds.length === 0) return

    setAlmacenProductIds((prev) => {
      let changed = false
      const next = new Set(prev)

      inferredIds.forEach((id) => {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [products])

  const almacenProducts = useMemo(
    () =>
      products
        .filter((product) => almacenProductIds.has(product.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })),
    [products, almacenProductIds],
  )

  useEffect(() => {
    setCountedStockByProduct(
      Object.fromEntries(almacenProducts.map((product) => [product.id, String(Math.max(0, Number(product.stock) || 0))])),
    )
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCountedStockByProduct((prev) => {
      const next: Record<string, string> = {}
      almacenProducts.forEach((product) => {
        next[product.id] = prev[product.id] ?? String(Math.max(0, Number(product.stock) || 0))
      })
      return next
    })
  }, [almacenProducts])

  const snapshotItems = useMemo<AlmacenClosingSnapshotItem[]>(
    () =>
      almacenProducts.map((product) => {
        const expectedStock = Math.max(0, Number(product.stock) || 0)
        const countedStock = parseCountedStockValue(countedStockByProduct[product.id], expectedStock)
        const unitCost = Number(product.buyPrice) || 0
        const unitPrice = Number(product.sellPrice) || 0
        const discrepancyUnits = expectedStock - countedStock
        const discrepancyCost = discrepancyUnits * unitCost

        return {
          productId: product.id,
          sku: formatAlmacenSku(product.sku),
          name: product.name,
          category: getAlmacenCategoryLabel(product.category),
          boxNumber: normalizeAlmacenBoxNumber(product.boxNumber),
          expectedStock,
          countedStock,
          unitCost,
          unitPrice,
          discrepancyUnits,
          discrepancyCost,
        }
      }),
    [almacenProducts, countedStockByProduct],
  )
  const summary = useMemo(() => {
    const totalProducts = snapshotItems.length
    const totalUnitsExpected = snapshotItems.reduce((acc, item) => acc + item.expectedStock, 0)
    const totalUnitsCounted = snapshotItems.reduce((acc, item) => acc + item.countedStock, 0)
    const discrepancyUnits = totalUnitsExpected - totalUnitsCounted
    const totalCostExpected = snapshotItems.reduce((acc, item) => acc + item.expectedStock * item.unitCost, 0)
    const totalCostCounted = snapshotItems.reduce((acc, item) => acc + item.countedStock * item.unitCost, 0)
    const discrepancyCost = totalCostExpected - totalCostCounted
    const approved = discrepancyUnits === 0 && discrepancyCost === 0

    return {
      totalProducts,
      totalUnitsExpected,
      totalUnitsCounted,
      discrepancyUnits,
      totalCostExpected,
      totalCostCounted,
      discrepancyCost,
      status: approved ? "approved" : "pending",
    }
  }, [snapshotItems])

  const discrepancyProducts = useMemo(
    () => snapshotItems.filter((item) => item.discrepancyUnits !== 0 || item.discrepancyCost !== 0),
    [snapshotItems],
  )

  const todayClosingExists = useMemo(
    () => almacenClosings.some((closing) => closing.date === selectedDate && closing.status !== "rejected"),
    [almacenClosings, selectedDate],
  )

  const filterByDate = useCallback(<T extends Record<string, unknown>>(items: T[], dateField = "date"): T[] => {
    return items.filter((item) => {
      try {
        const dateValue = item[dateField]
        if (!dateValue) return false
        if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue === selectedDate
        }
        const itemDate = new Date(String(dateValue))
        if (Number.isNaN(itemDate.getTime())) return false
        const y = itemDate.getFullYear()
        const m = String(itemDate.getMonth() + 1).padStart(2, "0")
        const d = String(itemDate.getDate()).padStart(2, "0")
        return `${y}-${m}-${d}` === selectedDate
      } catch {
        return false
      }
    })
  }, [selectedDate])

  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales])

  const daySalesAll = useMemo<AlmacenSaleMetric[]>(() => {
    return filterByDate(sales)
      .filter((sale) => effectiveEmployeeFilter === "all" || sale.createdByEmployeeId === effectiveEmployeeFilter)
      .map((sale) => {
        const saleItems = Array.isArray(sale.items) ? sale.items : []
        let saleItemsTotal = 0
        let almacenItemsTotal = 0
        let almacenItemsCount = 0
        let nonAlmacenItemsCount = 0

        saleItems.forEach((rawItem) => {
          const item = rawItem as unknown as Record<string, unknown>
          const lineSubtotal = getItemSubtotal(item)
          saleItemsTotal += lineSubtotal

          if (isAlmacenItemRecord(item, almacenProductIds)) {
            almacenItemsCount += 1
            almacenItemsTotal += lineSubtotal
          } else {
            nonAlmacenItemsCount += 1
          }
        })

        const ratio =
          saleItemsTotal > 0
            ? Math.max(0, Math.min(1, almacenItemsTotal / saleItemsTotal))
            : almacenItemsCount > 0 && nonAlmacenItemsCount === 0
              ? 1
              : 0

        if (ratio <= 0) return null

        const saleBreakdown = calculateSaleMethodBreakdown(sale)
        const almacenMethodBreakdown = scaleMethodBreakdown(saleBreakdown, ratio)
        const almacenTotal = sumMethodBreakdown(almacenMethodBreakdown)

        if (almacenTotal <= 0) return null

        return {
          ...sale,
          almacenTotal,
          almacenMethodBreakdown,
        }
      })
      .filter((sale): sale is AlmacenSaleMetric => Boolean(sale))
  }, [sales, filterByDate, almacenProductIds])

  const daySales = useMemo(
    () =>
      daySalesAll.filter((sale) => {
        const status = String(sale.status || "").toLowerCase()
        return !["pending", "anulada", "cancelled"].includes(status)
      }),
    [daySalesAll],
  )

  const dayReturns = useMemo<AlmacenReturnMetric[]>(() => {
    return filterByDate(returns)
      .map((ret) => {
        const originalSale = salesById.get(ret.invoiceId)
        const returnEmployeeId = originalSale?.createdByEmployeeId ?? null
        if (effectiveEmployeeFilter !== "all" && returnEmployeeId !== effectiveEmployeeFilter) return null
        const returnItems = Array.isArray(ret.items) ? ret.items : []

        const almacenTotal = returnItems.reduce((sum, rawItem) => {
          const returnItem = rawItem as unknown as Record<string, unknown>
          const saleItem = findMatchingSaleItemForReturn(originalSale, returnItem)
          const isAlmacenReturnItem = isAlmacenItemRecord(saleItem ?? returnItem, almacenProductIds)
          if (!isAlmacenReturnItem) return sum
          return sum + getItemSubtotal(returnItem)
        }, 0)

        if (almacenTotal <= 0) return null

        const almacenMethodBreakdown = createEmptyMethodBreakdown()
        
        // KEY FIX: Consider return type when calculating method breakdown
        // Si es devolución a crédito, SOLO afecta el método "credit"
        if (ret.type === "credito") {
          almacenMethodBreakdown.credit = almacenTotal
        } else if (originalSale) {
          // Para reembolso y cambio: distribuir según el método original de pago
          const saleBreakdown = calculateSaleMethodBreakdown(originalSale)
          const saleBreakdownTotal = sumMethodBreakdown(saleBreakdown)

          if (saleBreakdownTotal > 0) {
            ;(Object.keys(almacenMethodBreakdown) as PaymentMethodKey[]).forEach((method) => {
              almacenMethodBreakdown[method] = (saleBreakdown[method] / saleBreakdownTotal) * almacenTotal
            })
          } else {
            almacenMethodBreakdown[normalizePaymentMethod(originalSale.paymentMethod)] = almacenTotal
          }
        } else {
          almacenMethodBreakdown.cash = almacenTotal
        }

        return {
          ...ret,
          almacenTotal,
          almacenMethodBreakdown,
        }
      })
      .filter((ret): ret is AlmacenReturnMetric => Boolean(ret))
  }, [returns, filterByDate, salesById, almacenProductIds])

  const dayPayments = useMemo<AlmacenDebtPaymentRecord[]>(
    () => almacenDebtPayments.filter((payment) =>
      effectiveEmployeeFilter === "all" || payment.createdByEmployeeId === effectiveEmployeeFilter,
    ),
    [almacenDebtPayments, effectiveEmployeeFilter],
  )
  const dayRepairs = useMemo<typeof repairs>(() => [], [])
  const dayExpenses = useMemo<typeof expenses>(() => [], [])

  const filteredSales = useMemo(() => {
    return daySalesAll.filter((sale) => {
      if (filterPaymentMethod !== "all" && normalizePaymentMethod(sale.paymentMethod) !== filterPaymentMethod) return false

      if (filterStatus !== "all") {
        const status = String(sale.status || "").toLowerCase()
        if (filterStatus === "completed" && !["completed", "completada", "credito"].includes(status)) return false
        if (filterStatus === "pending" && status !== "pending") return false
        if (filterStatus === "cancelled" && !["anulada", "cancelled"].includes(status)) return false
      }

      if (filterHour !== "all") {
        const [start, end] = filterHour.split("-").map(Number)
        const saleHour = new Date(sale.date).getHours()
        if (Number.isNaN(saleHour) || saleHour < start || saleHour >= end) return false
      }

      return true
    })
  }, [daySalesAll, filterPaymentMethod, filterStatus, filterHour])

  const paymentMethodTotals = useMemo(() => {
    const methods = createEmptyMethodTotals()

    daySales.forEach((sale) => {
      ;(Object.keys(methods) as PaymentMethodKey[]).forEach((method) => {
        methods[method].sales += sale.almacenMethodBreakdown[method]
      })
    })

    dayReturns.forEach((ret) => {
      ;(Object.keys(methods) as PaymentMethodKey[]).forEach((method) => {
        methods[method].returns += ret.almacenMethodBreakdown[method]
      })
    })

    dayPayments.forEach((payment) => {
      const method = normalizePaymentMethod(payment.payment_method || "cash")
      methods[method].payments += normalizePositiveAmount(payment.amount)
    })

    return methods
  }, [daySales, dayReturns, dayPayments])

  const paymentSummary = useMemo(() => {
    const totalSales =
      paymentMethodTotals.cash.sales +
      paymentMethodTotals.card.sales +
      paymentMethodTotals.transfer.sales +
      paymentMethodTotals.credit.sales

    const totalReturns =
      paymentMethodTotals.cash.returns +
      paymentMethodTotals.card.returns +
      paymentMethodTotals.transfer.returns +
      paymentMethodTotals.credit.returns
    const totalPayments =
      paymentMethodTotals.cash.payments +
      paymentMethodTotals.card.payments +
      paymentMethodTotals.transfer.payments +
      paymentMethodTotals.credit.payments
    const totalRepairs = 0
    const totalExpenses = 0
    const netIncome = totalSales - totalReturns + totalPayments

    return {
      totalSales,
      totalReturns,
      totalPayments,
      totalRepairs,
      totalExpenses,
      netIncome,
    }
  }, [paymentMethodTotals])

  const totalDebtPayments =
    paymentMethodTotals.cash.payments +
    paymentMethodTotals.card.payments +
    paymentMethodTotals.transfer.payments +
    paymentMethodTotals.credit.payments
  const pendingDebtToConfirmChecks = useMemo(
    () =>
      daySales.reduce((sum, sale) => {
        if (sale.status !== "credito" || sale.manualPaidChecked) return sum
        const pendingAmount = Math.max(0, normalizePositiveAmount(sale.total) - normalizePositiveAmount(sale.amountPaid))
        return sum + pendingAmount
      }, 0),
    [daySales],
  )

  const netCashInFlow = paymentMethodTotals.cash.sales + paymentMethodTotals.cash.payments - paymentMethodTotals.cash.returns
  const closingFinancialSummary = useMemo<AlmacenClosingFinancialSummary>(
    () => ({
      totalSales: paymentSummary.totalSales,
      invoiceCount: daySales.length,
      cashNet: netCashInFlow,
      cardNet: paymentMethodTotals.card.sales + paymentMethodTotals.card.payments - paymentMethodTotals.card.returns,
      transferNet:
        paymentMethodTotals.transfer.sales + paymentMethodTotals.transfer.payments - paymentMethodTotals.transfer.returns,
      creditNet: paymentMethodTotals.credit.sales + paymentMethodTotals.credit.payments - paymentMethodTotals.credit.returns,
      totalReturns: paymentSummary.totalReturns,
      returnsCount: dayReturns.length,
      netIncome: paymentSummary.netIncome,
      cashDebtPayments: paymentMethodTotals.cash.payments,
    }),
    [dayReturns.length, daySales.length, netCashInFlow, paymentMethodTotals, paymentSummary],
  )
  const conteoExpectedAmount =
    (Number(openingBalance) || 0) +
    paymentMethodTotals.cash.sales +
    paymentMethodTotals.cash.payments -
    paymentMethodTotals.cash.returns
  const countedAmount = Number(manualCountedAmount) || 0
  const conteoDiscrepancy = conteoExpectedAmount - countedAmount

  const pieChartData = [
    { name: "Efectivo", value: paymentMethodTotals.cash.sales, color: COLORS.cash },
    { name: "Tarjeta", value: paymentMethodTotals.card.sales, color: COLORS.card },
    { name: "Transferencia", value: paymentMethodTotals.transfer.sales, color: COLORS.transfer },
    { name: "Credito", value: paymentMethodTotals.credit.sales, color: COLORS.credit },
  ].filter((item) => item.value > 0)

  const salesByHour = useMemo(() => {
    const hours: Record<number, number> = {}
    for (let i = 8; i <= 20; i++) hours[i] = 0

    daySales.forEach((sale) => {
      const saleDate = new Date(sale.date)
      const hour = saleDate.getHours()
      if (hours[hour] !== undefined) {
        hours[hour] += sale.almacenTotal
      }
    })

    return Object.entries(hours).map(([hour, total]) => ({
      hour: `${hour}:00`,
      ventas: Math.round(total * 100) / 100,
    }))
  }, [daySales])

  const loadAlmacenDebtPayments = useCallback(async () => {
    try {
      const [{ data, error }, { data: creditSalesData, error: creditSalesError }] = await Promise.all([
        supabase
          .from("almacen_payments")
          .select("*")
          .order("date", { ascending: false }),
        supabase
          .from("almacen_credit_sales")
          .select("id, customer_account_id, invoice_number, date")
          .order("date", { ascending: false }),
      ])

      if (error) {
        if (!isMissingTableError(error)) {
          console.error("Error loading almacen debt payments:", error)
        }
        setAlmacenDebtPayments([])
        return
      }

      if (creditSalesError && !isMissingTableError(creditSalesError)) {
        console.error("Error loading almacen credit sales:", creditSalesError)
      }

      const creditSalesById = new Map<string, string>()
      const creditSalesByCustomer = new Map<string, Array<{ date: string; invoice_number: string }>>()

      ;(creditSalesData || []).forEach((creditSale) => {
        const row = creditSale as Record<string, unknown>
        const creditSaleId = String(row.id || "")
        const customerAccountId = row.customer_account_id ? String(row.customer_account_id) : ""
        const invoiceNumber = String(row.invoice_number || "")
        const date = String(row.date || "")

        if (!invoiceNumber) return
        if (creditSaleId) creditSalesById.set(creditSaleId, invoiceNumber)

        if (customerAccountId) {
          const list = creditSalesByCustomer.get(customerAccountId) || []
          list.push({ date, invoice_number: invoiceNumber })
          creditSalesByCustomer.set(customerAccountId, list)
        }
      })

      const filteredBySelectedDate = filterByDate(
        (data || []).map((payment) => {
          const row = payment as Record<string, unknown>
          return {
            ...row,
            __effectiveDate: row.date ?? row.created_at ?? null,
          }
        }),
        "__effectiveDate",
      )

      setAlmacenDebtPayments(
        filteredBySelectedDate.map((payment) => {
          const row = payment as Record<string, unknown>
          const paymentDate = String(row.date ?? row.created_at ?? "")
          const paymentTimestamp = new Date(paymentDate).getTime()
          const customerAccountId = row.customer_account_id ? String(row.customer_account_id) : undefined
          const creditSaleId = row.credit_sale_id ? String(row.credit_sale_id) : undefined

          let relatedInvoiceNumber = creditSaleId ? creditSalesById.get(creditSaleId) || "" : ""

          if (!relatedInvoiceNumber && customerAccountId) {
            const customerCreditSales = creditSalesByCustomer.get(customerAccountId) || []
            const saleForPayment = customerCreditSales.find((sale) => {
              const saleTimestamp = new Date(sale.date).getTime()
              return Number.isFinite(paymentTimestamp) && Number.isFinite(saleTimestamp) && saleTimestamp <= paymentTimestamp
            })
            relatedInvoiceNumber = saleForPayment?.invoice_number || ""
          }

          return {
            id: String(row.id || ""),
            date: paymentDate,
            amount: Number(row.amount) || 0,
            payment_method: normalizePaymentMethod(String(row.payment_method || "cash")),
            customer_account_id: customerAccountId,
            credit_sale_id: creditSaleId,
            related_invoice_number: relatedInvoiceNumber || undefined,
            invoice_number: String(row.invoice_number || ""),
            previous_debt: Number(row.previous_debt) || 0,
            remaining_debt: Number(row.remaining_debt) || 0,
            createdByEmployeeId: row.created_by ? String(row.created_by) : undefined,
          }
        }),
      )
    } catch (error) {
      console.error("Error loading almacen debt payments:", error)
      setAlmacenDebtPayments([])
    }
  }, [selectedDate, supabase])

  const loadAlmacenCustomerAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("almacen_customer_accounts")
        .select("id, name, source_customer_id")

      if (error) {
        if (!isMissingTableError(error)) {
          console.error("Error loading almacen customer accounts:", error)
        }
        setAlmacenCustomerNamesById({})
        return
      }

      const nextMap: Record<string, string> = {}
      ;(data || []).forEach((row) => {
        const record = row as Record<string, unknown>
        const name = String(record.name || "").trim()
        const id = String(record.id || "").trim()
        const sourceCustomerId = String(record.source_customer_id || "").trim()
        if (!name) return
        if (id) nextMap[id] = name
        if (sourceCustomerId) nextMap[sourceCustomerId] = name
      })

      setAlmacenCustomerNamesById(nextMap)
    } catch (error) {
      console.error("Error loading almacen customer accounts:", error)
      setAlmacenCustomerNamesById({})
    }
  }, [supabase])

  const loadData = async () => {
    setIsLoading(true)
    try {
      await Promise.all([refreshData(), loadAlmacenDebtPayments(), loadAlmacenCustomerAccounts()])
      const { data, error } = await supabase
        .from("almacen_closings")
        .select("*")
        .order("date", { ascending: false })
        .limit(30)

      if (error) throw error
      setAlmacenClosings((data || []) as AlmacenClosing[])

      const fallbackIds = new Set(
        products
          .filter((product) => Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category)))
          .map((product) => String(product.id)),
      )
      const { data: armacenIdsData, error: armacenIdsError } = await supabase.from("armacen").select("id")
      if (armacenIdsError) {
        if (!isMissingTableError(armacenIdsError)) {
          console.error("Error loading armacen ids:", armacenIdsError)
        }
        setAlmacenProductIds(fallbackIds)
      } else {
        const idsFromTable = new Set(
          (armacenIdsData || [])
            .map((row) => buildSourceRuntimeId("armacen", (row as { id?: unknown }).id ?? ""))
            .filter((id) => id.length > 0),
        )

        const mergedIds = new Set([...idsFromTable, ...fallbackIds])
        setAlmacenProductIds(mergedIds)
      }
    } catch (error) {
      console.error("Error loading almacen closings:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los cierres de almacen.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useRealtimeTableRefresh(
    ["almacen_closings", "almacen_payments", "almacen_customer_accounts", "sales", "products", "armacen"],
    () => {
      void loadData()
    },
    { enabled: hasAccess, ownerAdminId: currentUser?.adminId ?? null },
  )

  useEffect(() => {
    if (!hasAccess) return
    loadData()
  }, [hasAccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasAccess) return
    loadAlmacenDebtPayments()
  }, [hasAccess, loadAlmacenDebtPayments])

  useEffect(() => {
    if (!hasAccess) return
    loadAlmacenCustomerAccounts()
  }, [hasAccess, loadAlmacenCustomerAccounts])

  const handleCountedStockChange = (productId: string, value: string) => {
    const normalizedValue = value.replace(/[^\d]/g, "")
    setCountedStockByProduct((prev) => ({ ...prev, [productId]: normalizedValue }))
  }

  const resolveFinancialSummaryFromClosing = useCallback(
    (closing: AlmacenClosing): AlmacenClosingFinancialSummary | undefined => {
      const row = closing as unknown as Record<string, unknown>
      const hasFinancialFields =
        row.total_sales !== undefined ||
        row.net_income !== undefined ||
        row.cash_net !== undefined ||
        row.card_net !== undefined ||
        row.transfer_net !== undefined ||
        row.credit_net !== undefined

      if (!hasFinancialFields) return undefined

      return {
        totalSales: Number(row.total_sales) || 0,
        invoiceCount: Number(row.sales_count) || 0,
        cashNet: Number(row.cash_net) || 0,
        cardNet: Number(row.card_net) || 0,
        transferNet: Number(row.transfer_net) || 0,
        creditNet: Number(row.credit_net) || 0,
        totalReturns: Number(row.total_returns) || 0,
        returnsCount: Number(row.returns_count) || 0,
        netIncome: Number(row.net_income) || 0,
        cashDebtPayments: Number(row.cash_debt_payments) || 0,
      }
    },
    [],
  )

  const handleDownloadHistory = async (closing: AlmacenClosing) => {
    try {
      const snapshot = normalizeSnapshot(closing.snapshot)
      const historicalFinancialSummary =
        resolveFinancialSummaryFromClosing(closing) || (closing.date === selectedDate ? closingFinancialSummary : undefined)
      const pdfBlob = await generateAlmacenClosingPDF({
        date: closing.date,
        closingNumber: closing.closing_number,
        cashier: closing.cashier_name,
        totalProducts: Number(closing.total_products) || snapshot.length,
        totalUnitsExpected: Number(closing.total_units_expected) || 0,
        totalUnitsCounted: Number(closing.total_units_counted) || 0,
        discrepancyUnits: Number(closing.discrepancy_units) || 0,
        totalCostExpected: Number(closing.total_cost_expected) || 0,
        totalCostCounted: Number(closing.total_cost_counted) || 0,
        discrepancyCost: Number(closing.discrepancy_cost) || 0,
        notes: closing.notes || "",
        snapshot,
        financialSummary: historicalFinancialSummary,
      }, currentUser?.adminId)

      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cierre-almacen-${closing.closing_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({ description: "PDF descargado correctamente." })
    } catch (error) {
      console.error("Error downloading almacen closing pdf:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el PDF del cierre de almacen.",
        variant: "destructive",
      })
    }
  }

  const getClosingInsertErrorMessage = (error: unknown) => {
    const err = error as { code?: string; message?: string; details?: string }
    const message = String(err?.message || "")
    const details = String(err?.details || "")

    if (err?.code === "23505") {
      return "Ya existe un cierre de almacén activo para esa fecha."
    }

    if (message.toLowerCase().includes("almacen_closings")) {
      return `No se pudo registrar en almacen_closings: ${message}`
    }

    if (details.trim().length > 0) {
      return details
    }

    if (message.trim().length > 0) {
      return message
    }

    return "No se pudo procesar el cierre de almacen."
  }

  const handleClosing = async () => {
    if (todayClosingExists) {
      toast({
        title: "Error",
        description: "Ya existe un cierre de almacen para esta fecha.",
        variant: "destructive",
      })
      return
    }

    if (summary.totalProducts === 0) {
      toast({
        title: "Sin productos",
        description: "No hay productos en almacen para cerrar.",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)

    try {
      const closingNumber = generateAlmacenClosingNumber()
      const closingData = {
        closing_number: closingNumber,
        date: selectedDate,
        start_time: startTime.toISOString(),
        end_time: new Date().toISOString(),
        cashier_id: currentUser?.id,
        cashier_name: currentUser?.name || "Sistema",
        total_products: summary.totalProducts,
        total_units_expected: summary.totalUnitsExpected,
        total_units_counted: summary.totalUnitsCounted,
        discrepancy_units: summary.discrepancyUnits,
        total_cost_expected: summary.totalCostExpected,
        total_cost_counted: summary.totalCostCounted,
        discrepancy_cost: summary.discrepancyCost,
        status: summary.status,
        notes: closingNotes || "",
        snapshot: snapshotItems,
      }

      const { error } = await supabase.from("almacen_closings").insert(closingData)
      if (error) throw error

      const pdfBlob = await generateAlmacenClosingPDF({
        date: selectedDate,
        closingNumber,
        cashier: currentUser?.name || "Sistema",
        totalProducts: summary.totalProducts,
        totalUnitsExpected: summary.totalUnitsExpected,
        totalUnitsCounted: summary.totalUnitsCounted,
        discrepancyUnits: summary.discrepancyUnits,
        totalCostExpected: summary.totalCostExpected,
        totalCostCounted: summary.totalCostCounted,
        discrepancyCost: summary.discrepancyCost,
        notes: closingNotes,
        snapshot: snapshotItems,
        financialSummary: closingFinancialSummary,
      }, currentUser?.adminId)

      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cierre-almacen-${closingNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      void printAlmacenClosingTicket(
        {
          closingNumber,
          date: selectedDate,
          cashierName: currentUser?.name || "Sistema",
          totalProducts: summary.totalProducts,
          totalUnitsExpected: summary.totalUnitsExpected,
          totalUnitsCounted: summary.totalUnitsCounted,
          discrepancyUnits: summary.discrepancyUnits,
          totalCostExpected: summary.totalCostExpected,
          totalCostCounted: summary.totalCostCounted,
          discrepancyCost: summary.discrepancyCost,
          notes: closingNotes,
          financialSummary: closingFinancialSummary,
        },
        undefined,
        currentUser?.adminId,
      )

      toast({
        description: `Cierre de almacen ${closingNumber} procesado correctamente.`,
      })

      setShowClosingDialog(false)
      setClosingNotes("")
      await loadData()
    } catch (error) {
      console.error("Error processing almacen closing:", error)
      toast({
        title: "Error",
        description: getClosingInsertErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Aprobado
          </Badge>
        )
      case "pending":
        return (
          <Badge className="bg-yellow-500">
            <Clock className="mr-1 h-3 w-3" />
            Pendiente
          </Badge>
        )
      case "rejected":
        return <Badge className="bg-red-500">Rechazado</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Lock className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Acceso Restringido</h2>
        <p className="text-muted-foreground">Solo administradores o empleados con permiso pueden ver esta pagina.</p>
        <Link to="/" className="text-sm text-primary underline">
          Volver al inicio
        </Link>
      </div>
    )
  }

  const getCustomerName = (customerId: string) => {
    const almacenName = almacenCustomerNamesById[customerId]
    if (almacenName) return almacenName
    const customer = customers.find(c => c.id === customerId)
    return customer ? customer.name : "Cliente Desconocido"
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 shadow-lg">
                <Warehouse className="h-8 w-8" />
              </div>
              <div>
                <h1 className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xl sm:text-2xl font-bold">
                  Cierre de Almacen
                  <Badge variant="outline" className="sm:ml-2 border-blue-400 text-blue-400 text-xs sm:text-sm w-fit">
                    {new Date(selectedDate).toLocaleDateString("es-DO", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Badge>
                </h1>
                <div className="mt-1 flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {currentUser?.name || "Usuario"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Inicio: {startTime.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Select value={currentYear} onValueChange={setCurrentYear}>
                  <SelectTrigger className="w-[90px] sm:w-[100px] border-slate-600 bg-slate-700 text-white text-xs sm:text-sm">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={currentMonth} onValueChange={setCurrentMonth}>
                  <SelectTrigger className="w-[100px] sm:w-[120px] border-slate-600 bg-slate-700 text-white text-xs sm:text-sm">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={currentDay} onValueChange={setCurrentDay}>
                  <SelectTrigger className="w-[90px] sm:w-[100px] border-slate-600 bg-slate-700 text-white text-xs sm:text-sm">
                    <SelectValue placeholder="Dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger className="w-[180px] border-slate-600 bg-slate-700 text-white text-xs sm:text-sm">
                      <SelectValue placeholder="Empleado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los empleados</SelectItem>
                      {employeeOptions.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button variant="outline" className="border-slate-600 bg-transparent text-black hover:bg-slate-700 hover:text-white text-xs sm:text-sm h-9 sm:h-10" asChild>
                <Link to="/">
                  <Home className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Panel</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {todayClosingExists && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Ya existe un cierre para esta fecha</p>
              <p className="text-sm text-yellow-600">No se puede realizar otro cierre. Consulta el historial para ver los detalles.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-medium">Total Facturado</p>
                  <p className="text-2xl font-bold">${formatCurrency(paymentSummary.totalSales)}</p>
                  <p className="text-green-100 text-xs">{daySales.length} facturas</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-xs font-medium">En Efectivo</p>
                  <p className="text-2xl font-bold">${formatCurrency(netCashInFlow)}</p>
                  <p className="text-emerald-100 text-xs">Ventas + Abonos deuda - Devoluciones en efectivo</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Banknote className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium">En Tarjeta</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(paymentMethodTotals.card.sales + paymentMethodTotals.card.payments - paymentMethodTotals.card.returns)}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-xs font-medium">Transferencias</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(
                      paymentMethodTotals.transfer.sales +
                      paymentMethodTotals.transfer.payments -
                      paymentMethodTotals.transfer.returns,
                    )}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <ArrowRightLeft className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-xs font-medium">A Credito</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(paymentMethodTotals.credit.sales + paymentMethodTotals.credit.payments - paymentMethodTotals.credit.returns)}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-xs font-medium">Devoluciones</p>
                  <p className="text-2xl font-bold">-${formatCurrency(paymentSummary.totalReturns)}</p>
                  <p className="text-red-100 text-xs">{dayReturns.length} devoluciones</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border shadow-sm bg-gradient-to-br from-slate-800 to-slate-900 text-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-300">Abonos Deuda (Efectivo)</p>
                  <p className="text-xl font-bold">${formatCurrency(paymentMethodTotals.cash.payments)}</p>
                  <p className="text-xs text-slate-400">Solo de cuentas cliente-almacen</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ventas Netas de Almacen</p>
                  <p className="text-xl font-bold text-blue-600">${formatCurrency(paymentSummary.netIncome)}</p>
                  <p className="text-xs text-muted-foreground">Facturado + abonos - devoluciones</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Facturas de Almacen</p>
                  <p className="text-xl font-bold text-orange-600">{daySales.length}</p>
                  <p className="text-xs text-muted-foreground">Solo ventas del inventario de almacen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="flex flex-wrap h-auto w-full sm:w-auto">
              <TabsTrigger value="resumen" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Resumen</span>
              </TabsTrigger>
              <TabsTrigger value="movimientos" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Movimientos</span>
              </TabsTrigger>
              <TabsTrigger value="conteo" className="gap-2">
                <Coins className="h-4 w-4" />
                <span className="hidden sm:inline">Conteo</span>
              </TabsTrigger>
              <TabsTrigger value="gastos" className="gap-2">
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Gastos</span>
              </TabsTrigger>
              <TabsTrigger value="historial" className="gap-2">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Historial</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadData()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => setShowClosingDialog(true)}
                disabled={todayClosingExists || isProcessing || summary.totalProducts === 0}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                <Lock className="mr-2 h-4 w-4" />
                Realizar Cierre
              </Button>
            </div>
          </div>

          <TabsContent value="resumen" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-blue-500" />
                    Distribucion por Metodo de Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pieChartData.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {pieChartData.map((entry, index) => (
                              <Cell key={`almacen-pie-cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No hay ventas registradas
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-green-500" />
                    Ventas por Hora
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesByHour}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(value) => `$${value}`} />
                        <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                        <Bar dataKey="ventas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Desglose Detallado por Metodo de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Metodo</TableHead>
                      <TableHead className="text-right">Ventas Brutas</TableHead>
                      <TableHead className="text-right">Abonos</TableHead>
                      <TableHead className="text-right">Devoluciones</TableHead>
                      <TableHead className="text-right font-bold">Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(paymentMethodTotals).map(([method, totals]) => {
                      const net = totals.sales + totals.payments - totals.returns
                      return (
                        <TableRow key={method}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: COLORS[method as keyof typeof COLORS] }}
                              />
                              {method === "cash"
                                ? "Efectivo"
                                : method === "card"
                                  ? "Tarjeta"
                                  : method === "transfer"
                                    ? "Transferencia"
                                    : "Credito"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-green-600">${formatCurrency(totals.sales)}</TableCell>
                          <TableCell className="text-right text-blue-600">+${formatCurrency(totals.payments)}</TableCell>
                          <TableCell className="text-right text-red-600">-${formatCurrency(totals.returns)}</TableCell>
                          <TableCell className="text-right font-bold">${formatCurrency(net)}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-slate-100 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right text-green-600">${formatCurrency(paymentSummary.totalSales)}</TableCell>
                      <TableCell className="text-right text-blue-600">+${formatCurrency(paymentSummary.totalPayments)}</TableCell>
                      <TableCell className="text-right text-red-600">-${formatCurrency(paymentSummary.totalReturns)}</TableCell>
                      <TableCell className="text-right">${formatCurrency(paymentSummary.netIncome)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Productos con Diferencia ({discrepancyProducts.length})
                </CardTitle>
                <CardDescription>Detalle de items que no cuadran con el stock esperado.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[280px]">
                  <Table>
                    <TableHeader><TableRow><TableHead>Codigo</TableHead><TableHead>Producto</TableHead><TableHead className="text-right">Dif. unid.</TableHead><TableHead className="text-right">Dif. costo</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {discrepancyProducts.length > 0 ? discrepancyProducts.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-mono">{item.sku || "-"}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell className="text-right">{item.discrepancyUnits}</TableCell>
                          <TableCell className="text-right">${formatCurrency(item.discrepancyCost)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No hay diferencias, el almacen esta cuadrado.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movimientos" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filtros:</span>
                  </div>
                  <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Metodo de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="credit">Credito</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="completed">Pagada</SelectItem>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterHour} onValueChange={setFilterHour}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Hora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="8-12">8:00 - 12:00</SelectItem>
                      <SelectItem value="12-16">12:00 - 16:00</SelectItem>
                      <SelectItem value="16-20">16:00 - 20:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Facturas del Dia ({filteredSales.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[360px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Factura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1">Metodo</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1 text-right">Total Almacen</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono font-medium">{sale.invoiceNumber || sale.invoice_number}</TableCell>
                            <TableCell>{sale.customer_name || sale.customerName || "Cliente General"}</TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1">
                              {(() => {
                                const paymentMethod = normalizePaymentMethod(sale.paymentMethod)
                                const paymentLabel =
                                  paymentMethod === "cash"
                                    ? "Efectivo"
                                    : paymentMethod === "card"
                                      ? "Tarjeta"
                                      : paymentMethod === "transfer"
                                        ? "Transferencia"
                                        : "Credito"
                                return (
                                  <Badge
                                    variant="outline"
                                    style={{
                                      borderColor: COLORS[paymentMethod],
                                      color: COLORS[paymentMethod],
                                    }}
                                  >
                                    {paymentLabel}
                                  </Badge>
                                )
                              })()}
                            </TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1 text-right font-bold">${formatCurrency(sale.almacenTotal)}</TableCell>
                            <TableCell>{new Date(sale.date).toLocaleTimeString()}</TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1">
                              <Badge
                                className={
                                  sale.status === "completada" || sale.status === "completed"
                                    ? "bg-green-500"
                                    : sale.status === "credito"
                                      ? "bg-amber-500"
                                      : sale.status === "pending"
                                        ? "bg-yellow-500"
                                        : sale.status === "anulada" || sale.status === "cancelled"
                                          ? "bg-red-500"
                                          : "bg-orange-500"
                                }
                              >
                                {sale.status === "completada" || sale.status === "completed"
                                  ? "Pagada"
                                  : sale.status === "credito"
                                    ? "Credito"
                                    : sale.status === "pending"
                                      ? "Pendiente"
                                      : sale.status === "anulada" || sale.status === "cancelled"
                                        ? "Cancelada"
                                        : "Devuelta"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No hay facturas que mostrar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-5 w-5" />
                    Devoluciones ({dayReturns.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[220px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Devolucion</TableHead>
                          <TableHead>Factura</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Usuario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayReturns.length > 0 ? (
                          dayReturns.map((ret) => (
                            <TableRow key={ret.id}>
                              <TableCell className="font-mono">{ret.returnNumber}</TableCell>
                              <TableCell>{ret.invoiceNumber}</TableCell>
                              <TableCell className="text-right text-red-600 font-bold">-${formatCurrency(ret.almacenTotal)}</TableCell>
                              <TableCell>{ret.processed_by || "Sistema"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                              No hay devoluciones
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <FileText className="h-5 w-5" />
                    Pagos de Deuda ({dayPayments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[220px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Pago</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="text-right">Deuda Ant.</TableHead>
                          <TableHead className="text-right">Restante</TableHead>
                          <TableHead className="text-center">Detalles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayPayments.length > 0 ? (
                          dayPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="font-mono font-medium">
                                {payment.related_invoice_number || payment.invoice_number || payment.id}
                              </TableCell>
                              <TableCell className="text-right text-green-600">${formatCurrency(payment.amount)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {payment.previous_debt !== undefined ? formatCurrency(payment.previous_debt) : "-"}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {payment.remaining_debt !== undefined ? formatCurrency(payment.remaining_debt) : "-"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver detalles"
                                  onClick={() => setSelectedPayment(payment)}
                                >
                                  <Eye className="h-4 w-4 text-blue-600" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No hay pagos
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

          </TabsContent>

          <TabsContent value="conteo" className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-500" />
                    Registro de Caja
                  </CardTitle>
                  <CardDescription>Ventas + pagos de deuda en efectivo - devoluciones de almacen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="opening">Monto Inicial de Caja</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="opening"
                        type="number"
                        value={openingBalance}
                        onChange={(event) => setOpeningBalance(event.target.value)}
                        className="pl-9 text-lg"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm">+ Ventas en Efectivo</span>
                      <span className="font-bold text-green-600">${formatCurrency(paymentMethodTotals.cash.sales)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm">+ Abonos Deuda (Efectivo)</span>
                      <span className="font-bold text-blue-600">${formatCurrency(paymentMethodTotals.cash.payments)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                      <span className="text-sm">- Devoluciones en Efectivo</span>
                      <span className="font-bold text-red-600">-${formatCurrency(paymentMethodTotals.cash.returns)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="p-4 bg-slate-900 text-white rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">TOTAL ESPERADO EN CAJA</span>
                      <span className="text-2xl font-bold">${formatCurrency(conteoExpectedAmount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-500" />
                    Conteo Fisico de Caja
                  </CardTitle>
                  <CardDescription>Ingrese la cantidad de cada denominacion</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="manual-count" className="text-lg">Monto Total en Caja</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="manual-count"
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualCountedAmount}
                          onChange={(event) => setManualCountedAmount(event.target.value)}
                          className="pl-10 text-xl h-12"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Ingrese el monto total de dinero contado fisicamente en la caja (billetes + monedas).
                      </p>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="font-medium">Total Contado</span>
                      <span className="text-xl font-bold text-blue-600">${formatCurrency(countedAmount)}</span>
                    </div>

                    <div
                      className={`flex justify-between items-center p-4 rounded-lg ${
                        conteoDiscrepancy === 0 ? "bg-green-100" : conteoDiscrepancy > 0 ? "bg-red-100" : "bg-orange-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {conteoDiscrepancy === 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : conteoDiscrepancy > 0 ? (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                        )}
                        <span className="font-medium">
                          {conteoDiscrepancy === 0 ? "Cuadrado" : conteoDiscrepancy > 0 ? "Faltante" : "Sobrante"}
                        </span>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          conteoDiscrepancy === 0 ? "text-green-600" : conteoDiscrepancy > 0 ? "text-red-600" : "text-orange-600"
                        }`}
                      >
                        ${formatCurrency(Math.abs(conteoDiscrepancy))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="gastos" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-orange-500" />
                  Gastos del Dia
                </CardTitle>
                <CardDescription>Registro de egresos y gastos operativos</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Usuario</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayExpenses.length > 0 ? (
                      dayExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="font-medium">{expense.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {expense.category === "operativo"
                                ? "Operativo"
                                : expense.category === "suministros"
                                  ? "Suministros"
                                  : expense.category === "servicios"
                                    ? "Servicios"
                                    : "Otros"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600">-${(Number(expense.amount) || 0).toLocaleString()}</TableCell>
                          <TableCell>{expense.paymentMethod === "cash" ? "Efectivo" : "Otro"}</TableCell>
                          <TableCell>{expense.createdAt ? new Date(expense.createdAt).toLocaleTimeString() : ""}</TableCell>
                          <TableCell>{expense.userName}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay gastos registrados para hoy
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="bg-slate-50">
                <div className="flex justify-between items-center w-full">
                  <span className="font-medium">Total Gastos</span>
                  <span className="text-xl font-bold text-orange-600">
                    -${paymentSummary.totalExpenses.toLocaleString()}
                  </span>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="historial" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-500" />
                  Historial de Cierres
                </CardTitle>
                <CardDescription>Ultimos 30 cierres de almacen realizados</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader><TableRow><TableHead>No. Cierre</TableHead><TableHead>Fecha</TableHead><TableHead>Usuario</TableHead><TableHead className="text-right">Productos</TableHead><TableHead className="text-right">Dif. unid.</TableHead><TableHead className="text-right">Dif. costo</TableHead><TableHead className="w-[1%] whitespace-nowrap px-1">Estado</TableHead><TableHead className="w-[1%] whitespace-nowrap px-1 text-right"></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {almacenClosings.length > 0 ? almacenClosings.map((closing) => (
                        <TableRow key={closing.id}>
                          <TableCell className="font-mono font-medium">{closing.closing_number}</TableCell>
                          <TableCell>{new Date(closing.date).toLocaleDateString()}</TableCell>
                          <TableCell>{closing.cashier_name}</TableCell>
                          <TableCell className="text-right">{Number(closing.total_products) || 0}</TableCell>
                          <TableCell className="text-right">{Number(closing.discrepancy_units) || 0}</TableCell>
                          <TableCell className="text-right">${formatCurrency(Number(closing.discrepancy_cost) || 0)}</TableCell>
                          <TableCell className="w-[1%] whitespace-nowrap px-1">{getStatusBadge(closing.status)}</TableCell>
                          <TableCell className="w-[1%] whitespace-nowrap px-1 text-right"><Button variant="ghost" size="icon" onClick={() => handleDownloadHistory(closing)} title="Descargar PDF"><Download className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">{isLoading ? "Cargando historial..." : "No hay cierres registrados"}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selectedPayment} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalles del Pago</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Cliente</p>
                <p className="text-lg font-semibold">
                  {selectedPayment.customer_account_id
                    ? getCustomerName(selectedPayment.customer_account_id)
                    : "Cliente Desconocido"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Monto</p>
                  <p className="text-2xl font-bold text-green-600">${formatCurrency(selectedPayment.amount)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Método de Pago</p>
                  <p className="text-lg font-semibold">
                    {selectedPayment.payment_method === "cash"
                      ? "Efectivo"
                      : selectedPayment.payment_method === "card"
                        ? "Tarjeta"
                        : selectedPayment.payment_method === "transfer"
                          ? "Transferencia"
                          : "Crédito"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Deuda Anterior</p>
                  <p className="text-lg font-bold">${formatCurrency(selectedPayment.previous_debt || 0)}</p>
                </div>
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Deuda Restante</p>
                  <p className="text-lg font-bold">${formatCurrency(selectedPayment.remaining_debt || 0)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Fecha del Pago</p>
                <p className="text-base">{new Date(selectedPayment.date).toLocaleString()}</p>
              </div>

              {(selectedPayment.related_invoice_number || selectedPayment.invoice_number || selectedPayment.id) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">ID Factura/Pago</p>
                  <p className="text-base font-mono">
                    {selectedPayment.related_invoice_number || selectedPayment.invoice_number || selectedPayment.id}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPayment(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Confirmar Cierre de Almacen
            </DialogTitle>
            <DialogDescription>Esta accion finalizara el dia y generara el reporte de cierre</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Total Ventas</p>
                <p className="font-bold text-green-600">${formatCurrency(paymentSummary.totalSales)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Devoluciones</p>
                <p className="font-bold text-red-600">-${formatCurrency(paymentSummary.totalReturns)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Esperado</p>
                <p className="font-bold">${formatCurrency(conteoExpectedAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contado</p>
                <p className="font-bold">${formatCurrency(countedAmount)}</p>
              </div>
            </div>

            {/* Discrepancy Alert */}
            <div
              className={`p-4 rounded-lg flex items-center gap-3 ${conteoDiscrepancy === 0
                ? "bg-green-100 text-green-800"
                : conteoDiscrepancy > 0
                  ? "bg-red-100 text-red-800"
                  : "bg-orange-100 text-orange-800"
                }`}
            >
              {conteoDiscrepancy === 0 ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
              <div>
                <p className="font-bold">
                  {conteoDiscrepancy === 0
                    ? "Caja Cuadrada"
                    : conteoDiscrepancy > 0
                      ? `Faltante: $${formatCurrency(Math.abs(conteoDiscrepancy))}`
                      : `Sobrante: $${formatCurrency(Math.abs(conteoDiscrepancy))}`}
                </p>
                <p className="text-sm opacity-80">
                  {conteoDiscrepancy === 0 ? "Todo en orden" : "Se requiere revision de supervisor"}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Comentarios / Observaciones</Label>
              <Textarea
                value={closingNotes}
                onChange={(event) => setClosingNotes(event.target.value)}
                placeholder="Agregue notas sobre anomalias, explicaciones de diferencias, etc."
                rows={3}
              />
            </div>

            {/* Signatures placeholder */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="h-16 border-b border-dashed border-slate-300 mb-2"></div>
                <p className="text-xs text-muted-foreground">Firma del Cajero</p>
              </div>
              <div className="text-center">
                <div className="h-16 border-b border-dashed border-slate-300 mb-2"></div>
                <p className="text-xs text-muted-foreground">Firma del Supervisor</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowClosingDialog(false)}>Cancelar</Button>
            <Button
              type="button"
              onClick={handleClosing}
              disabled={isProcessing}
              className="bg-gradient-to-r from-blue-600 to-blue-700"
            >
              {isProcessing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Procesando...</> : <><Lock className="mr-2 h-4 w-4" />Confirmar Cierre</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
