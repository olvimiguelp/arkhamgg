"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,

  Download,
  Wallet,
  CreditCard,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Wrench,
  Receipt,
  Calculator,
  ArrowDownRight,
  BarChart3,
  PieChartIcon,
  XCircle,
  Plus,
  Trash2,
  Lock,
  User,
  History,
  Banknote,
  Coins,
  Filter,
  RefreshCw,
  Home,
  AlertCircle,
  Eye,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useStore } from "@/components/store-context"
import { useRealtimeTableRefresh } from "@/hooks/use-realtime-table-refresh"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
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
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { generateCashClosingPDF, generateClosingNumber } from "@/lib/cash-closing-pdf"
import { printCashClosingTicket } from "@/components/invoice-printer"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/lib/utils"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { createClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SaleDetailsDialog } from "@/components/sale-details-dialog"
import { Link } from "react-router-dom"
import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"
import { buildSourceRuntimeId, isAlmacenSourceRecord } from "@/lib/transaction-classification"

const COLORS = {
  cash: "#22c55e",
  card: "#3b82f6",
  transfer: "#8b5cf6",
  credit: "#f59e0b",
}

type PaymentMethodKey = keyof typeof COLORS

const normalizePositiveAmount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

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

const readEmployeeIdFromRecord = (record?: Record<string, unknown> | null) => {
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

const getLocalDateKey = (value: string | Date | null | undefined) => {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getItemId = (item?: Record<string, unknown> | null) => {
  const rawId = item?.productId ?? item?.id
  return typeof rawId === "string" && rawId.trim() ? rawId.trim() : null
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
  const unitPrice = Number(item.customPrice ?? item.sellPrice ?? item.price ?? item.unitPrice ?? 0)
  const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
  return Math.max(0, quantity * safeUnitPrice)
}

const isAlmacenItemRecord = (
  item: Record<string, unknown> | null | undefined,
  almacenProductIds: Set<string>,
) => {
  if (!item) return false
  if (isAlmacenSourceRecord(item, almacenProductIds)) return true

  const itemId = getItemId(item)
  if (Boolean(itemId && almacenProductIds.has(itemId))) return true

  const rawBoxNumber = item.boxNumber ?? item.box_number
  if (normalizeAlmacenBoxNumber(rawBoxNumber == null ? undefined : String(rawBoxNumber))) return true

  const rawCategory = item.category ?? item.productCategory ?? item.product_category
  if (isAlmacenCategory(rawCategory == null ? undefined : String(rawCategory))) return true

  return false
}

const findMatchingSaleItemForReturn = (sale: any, returnItem: Record<string, unknown>) => {
  if (!sale || !Array.isArray(sale.items)) return undefined

  const returnItemId = getItemId(returnItem)
  if (returnItemId) {
    const byId = sale.items.find((item: any) => getItemId(item as Record<string, unknown>) === returnItemId)
    if (byId) return byId as Record<string, unknown>
  }

  const returnItemName = getItemName(returnItem)
  if (!returnItemName) return undefined

  const byName = sale.items.find((item: any) => getItemName(item as Record<string, unknown>) === returnItemName)
  return byName as Record<string, unknown> | undefined
}

const isAlmacenReturnItemRecord = (
  returnItem: Record<string, unknown>,
  originalSale: any,
  almacenProductIds: Set<string>,
) => {
  if (isAlmacenItemRecord(returnItem, almacenProductIds)) return true
  const matchedSaleItem = findMatchingSaleItemForReturn(originalSale, returnItem)
  return isAlmacenItemRecord(matchedSaleItem, almacenProductIds)
}

const createEmptyMethodBreakdown = () => ({
  cash: 0,
  card: 0,
  transfer: 0,
  credit: 0,
})

const sumMethodBreakdown = (totals: Record<PaymentMethodKey, number>) =>
  totals.cash + totals.card + totals.transfer + totals.credit

const calculateSaleMethodBreakdown = (
  totalValue: number,
  paidValue: number,
  paymentMethod: PaymentMethodKey,
) => {
  const breakdown = createEmptyMethodBreakdown()
  const saleTotal = normalizePositiveAmount(totalValue)
  if (saleTotal <= 0) return breakdown

  const amountPaid = Math.min(saleTotal, normalizePositiveAmount(paidValue))
  const hasSplitCredit = paymentMethod !== "credit" && amountPaid > 0 && amountPaid < saleTotal

  if (paymentMethod === "credit") {
    breakdown.credit = saleTotal
    return breakdown
  }

  if (hasSplitCredit) {
    breakdown[paymentMethod] = amountPaid
    breakdown.credit = saleTotal - amountPaid
    return breakdown
  }

  breakdown[paymentMethod] = saleTotal
  return breakdown
}

const getAlmacenRatioFromSale = (
  sale: any,
  almacenProductIds: Set<string>,
) => {
  const saleItems = Array.isArray(sale?.items) ? sale.items : []
  if (saleItems.length === 0) return 0

  let itemsTotal = 0
  let almacenTotal = 0
  let almacenCount = 0
  let nonAlmacenCount = 0

  saleItems.forEach((rawItem: any) => {
    const item = (rawItem ?? {}) as Record<string, unknown>
    const subtotal = getItemSubtotal(item)
    itemsTotal += subtotal

    if (isAlmacenItemRecord(item, almacenProductIds)) {
      almacenTotal += subtotal
      almacenCount += 1
    } else {
      nonAlmacenCount += 1
    }
  })

  if (itemsTotal > 0) return Math.max(0, Math.min(1, almacenTotal / itemsTotal))
  if (almacenCount > 0 && nonAlmacenCount === 0) return 1
  return 0
}



interface CashClosing {
  id: string
  closing_number: string
  date: string
  cashier_name: string
  total_sales: number
  total_returns: number
  total_payments: number
  total_expenses: number
  total_repairs: number
  expected_amount: number
  counted_amount: number
  discrepancy: number
  status: string
  notes: string
  pdf_url: string
  created_at: string
  opening_balance: number
}

export default function CashClosingPage() {
  const { sales, returns, payments, repairs, currentUser, employees, products, expenses, addExpense, deleteExpense, refreshData, customers } =
    useStore()
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateKey(new Date()))
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all")
  const [showClosingDialog, setShowClosingDialog] = useState(false)
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [closingNotes, setClosingNotes] = useState("")
  const [openingBalance, setOpeningBalance] = useState("0")
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState("resumen")
  const [activeMovement, setActiveMovement] = useState<"returns" | "transfers" | "payments">("returns")
  const [startTime] = useState(new Date())

  // Separate date parts
  const [currentDay, setCurrentDay] = useState<string>(new Date().getDate().toString())
  const [currentMonth, setCurrentMonth] = useState<string>((new Date().getMonth() + 1).toString())
  const [currentYear, setCurrentYear] = useState<string>(new Date().getFullYear().toString())


  // Sync selectedDate when parts change
  useEffect(() => {
    const monthStr = currentMonth.padStart(2, "0")
    const dayStr = currentDay.padStart(2, "0")
    setSelectedDate(`${currentYear}-${monthStr}-${dayStr}`)
  }, [currentDay, currentMonth, currentYear])

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const yearsArray = []
    for (let i = current - 5; i <= current; i++) {
      yearsArray.push(i.toString())
    }
    return yearsArray.reverse()
  }, [])

  const months = useMemo(() => [
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
  ], [])

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => (i + 1).toString()), [])

  const employeeOptions = useMemo(() => {
    const users = employees
      .filter((employee) => employee.role === "employee" || employee.role === "admin")
      .map((employee) => ({ id: employee.id, name: employee.name, email: employee.email }))
    if (currentUser && !users.some((employee) => employee.id === currentUser.id)) {
      users.push({ id: currentUser.id, name: currentUser.name, email: currentUser.email })
    }
    return users
  }, [employees, currentUser])

  // Expense form state
  const [expenseDescription, setExpenseDescription] = useState("")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [expenseCategory, setExpenseCategory] = useState("operativo")
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("cash")
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Cash count state
  const [manualCountedAmount, setManualCountedAmount] = useState("")

  // Expenses and closings state
  // const [expenses, setExpenses] = useState<Expense[]>([]) // Removed local state
  const [cashClosings, setCashClosings] = useState<CashClosing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [almacenProductIds, setAlmacenProductIds] = useState<Set<string>>(new Set())
  const [almacenCustomers, setAlmacenCustomers] = useState<any[]>([])

  // Filters
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all")
  const [selectedPayment, setSelectedPayment] = useState<(typeof dayPayments)[0] | null>(null)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterHour, setFilterHour] = useState("all")
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  const supabase = createClient()

  const reloadCashClosings = useCallback(async () => {
    let closingsQuery = supabase
      .from("cash_closings")
      .select("*")
      .eq("owner_admin_id", currentUser?.adminId || currentUser?.id || "__no_tenant__")

    if (currentUser?.role !== "admin" && currentUser?.role !== "super_admin") {
      closingsQuery = closingsQuery.eq("cashier_id", currentUser?.id || "__no_user__")
    }

    const { data: closingsData } = await closingsQuery
      .order("date", { ascending: false })
      .limit(30)
    if (closingsData) setCashClosings(closingsData)
  }, [supabase, currentUser])

  // Acceso: solo admin o empleado con permiso `cashClosing`
  const hasAccess = (() => {
    if (!currentUser) return false
    if (currentUser.role === "admin") return true
    if (currentUser.role === "employee") {
      const emp = employees.find((e) => e.email === currentUser.email)
      return emp?.permissions?.cashClosing === true
    }
    return false
  })()

  useRealtimeTableRefresh(
    ["cash_closings", "sales", "payments", "expenses", "returns"],
    () => {
      void reloadCashClosings()
      void refreshData()
    },
    { enabled: hasAccess, ownerAdminId: currentUser?.adminId ?? null },
  )

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Lock className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Acceso Restringido</h2>
        <p className="text-muted-foreground">Solo administradores o empleados con permiso pueden ver esta página.</p>
        <Link to="/" className="text-sm text-primary underline">
          Volver al inicio
        </Link>
      </div>
    )
  }

  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId)
    if (customer) return customer.name

    const almacenCustomer = almacenCustomers.find((c) => c.id === customerId)
    if (almacenCustomer) return almacenCustomer.name

    return "Cliente Desconocido"
  }

  const getPaymentResponsibleName = (payment: (typeof dayPayments)[number]) => {
    if (payment.createdByEmployeeName) return payment.createdByEmployeeName
    const employee = employees.find((item) => item.id === payment.createdByEmployeeId)
    if (employee) return employee.name
    if (payment.createdByEmployeeId === currentUser?.id) return currentUser.name
    return "No identificado"
  }


  // Load expenses and cash closings
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      await refreshData()
      // Load expenses - REMOVED, now using store
      // const { data: expensesData } = await supabase
      //   .from("expenses")
      //   .select("*")
      //   .order("created_at", { ascending: false })

      // if (expensesData) setExpenses(expensesData)

      // Load cash closings history
      let closingsQuery = supabase
        .from("cash_closings")
        .select("*")
        .eq("owner_admin_id", currentUser?.adminId || currentUser?.id || "__no_tenant__")

      if (currentUser?.role !== "admin" && currentUser?.role !== "super_admin") {
        closingsQuery = closingsQuery.eq("cashier_id", currentUser?.id || "__no_user__")
      }

      const { data: closingsData } = await closingsQuery
        .order("date", { ascending: false })
        .limit(30)

      if (closingsData) setCashClosings(closingsData)

      // Load almacen customer accounts for name mapping
      const { data: almacenCustomersData } = await supabase
        .from("almacen_customer_accounts")
        .select("*")
      if (almacenCustomersData) setAlmacenCustomers(almacenCustomersData)

      const fallbackIds = new Set<string>(
        products
          .filter((product) => Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category)))
          .map((product) => String(product.id)),
      )

      const { data: almacenIdsData, error: almacenIdsError } = await supabase.from("armacen").select("id")
      if (almacenIdsError) {
        console.log("[v0] Error loading armacen ids:", almacenIdsError)
        setAlmacenProductIds(fallbackIds)
      } else {
        const idsFromTable = new Set<string>(
          (almacenIdsData || []).map((row: any) => String(buildSourceRuntimeId("armacen", row.id))),
        )
        setAlmacenProductIds(new Set<string>([...idsFromTable, ...fallbackIds]))
      }
    } catch (error) {
      console.log("[v0] Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }


  const selectedEmployee = useMemo(() => {
    if (selectedEmployeeId === "all") return null
    return employeeOptions.find((e) => e.id === selectedEmployeeId) || null
  }, [selectedEmployeeId, employeeOptions])

  // Check if today's closing already exists
  const todayClosingExists = useMemo(() => {
    return cashClosings.some((c) => {
      if (c.date !== selectedDate || c.status === "rejected") return false
      if (selectedEmployeeId === "all") {
        return c.cashier_id === "all" || (c.cashier_name && c.cashier_name.toLowerCase().includes("general"))
      }
      return (
        c.cashier_id === selectedEmployeeId ||
        (selectedEmployee && c.cashier_name && c.cashier_name.toLowerCase() === selectedEmployee.name.toLowerCase())
      )
    })
  }, [cashClosings, selectedDate, selectedEmployeeId, selectedEmployee])

  // Filter data by selected date (timezone-safe)
  const filterByDate = (items: any[], dateField = "date") => {
    return items.filter((item) => {
      try {
        const dateValue = item[dateField]
        if (!dateValue) return false
        // If the value is already a plain YYYY-MM-DD date string, compare directly
        if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue === selectedDate
        }
        // For full ISO timestamps, use local date parts to avoid UTC timezone shift
        const itemDate = new Date(dateValue)
        if (isNaN(itemDate.getTime())) return false
        const y = itemDate.getFullYear()
        const m = String(itemDate.getMonth() + 1).padStart(2, "0")
        const d = String(itemDate.getDate()).padStart(2, "0")
        return `${y}-${m}-${d}` === selectedDate
      } catch {
        return false
      }
    })
  }

  const daySales = useMemo(
    () => filterByDate(sales).filter((s) => {
      const saleEmployeeId = readEmployeeIdFromRecord(s as Record<string, unknown>)
      return s.status !== "pending" && (selectedEmployeeId === "all" || saleEmployeeId === selectedEmployeeId)
    }),
    [sales, selectedDate, selectedEmployeeId],
  )
  const dayReturns = useMemo(
    () => filterByDate(returns).filter((ret) => {
      const returnEmployeeId = readEmployeeIdFromRecord(ret as Record<string, unknown>)
      const originalSale = sales.find((sale) => sale.id === ret.invoiceId)
      const saleEmployeeId = readEmployeeIdFromRecord(originalSale as Record<string, unknown>)
      return selectedEmployeeId === "all" || returnEmployeeId === selectedEmployeeId || saleEmployeeId === selectedEmployeeId
    }),
    [returns, sales, selectedDate, selectedEmployeeId],
  )
  const dayPayments = useMemo(
    () => filterByDate(payments, "date").filter((payment) => {
      const paymentEmployeeId = readEmployeeIdFromRecord(payment as Record<string, unknown>)
      if (selectedEmployeeId === "all") return true
      if (paymentEmployeeId === selectedEmployeeId) return true

      // Compatibilidad con abonos antiguos que conservaron el nombre del
      // responsable, pero no el UUID del empleado.
      const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
      return Boolean(
        selectedEmployee &&
          typeof payment.createdByEmployeeName === "string" &&
          payment.createdByEmployeeName.trim().toLowerCase() === selectedEmployee.name.trim().toLowerCase(),
      )
    }),
    [payments, selectedDate, selectedEmployeeId, employees],
  )
  const dayRepairs = useMemo(
    () =>
      filterByDate(repairs, "date").filter((r) => {
        if (r.status !== "completado") return false
        if (selectedEmployeeId === "all") return true

        const isSameTechId = r.technician === selectedEmployeeId
        const isSameTechName = Boolean(
          selectedEmployee &&
            typeof r.technician === "string" &&
            r.technician.trim().toLowerCase() === selectedEmployee.name.trim().toLowerCase(),
        )
        const rExt = r as unknown as { createdByEmployeeId?: string; createdByEmployeeName?: string }
        const isSameCreatorId = rExt.createdByEmployeeId === selectedEmployeeId
        const isSameCreatorName = Boolean(
          selectedEmployee &&
            typeof rExt.createdByEmployeeName === "string" &&
            rExt.createdByEmployeeName.trim().toLowerCase() === selectedEmployee.name.trim().toLowerCase(),
        )

        return isSameTechId || isSameTechName || isSameCreatorId || isSameCreatorName
      }),
    [repairs, selectedDate, selectedEmployeeId, selectedEmployee],
  )
  const dayExpenses = useMemo(
    () => filterByDate(expenses, "date").filter((expense) => {
      if (selectedEmployeeId !== "all") {
        return expense.userId === selectedEmployeeId
      }
      return currentUser?.role === "admin" || currentUser?.role === "super_admin"
        ? true
        : expense.userId === currentUser?.id
    }),
    [expenses, selectedDate, currentUser, selectedEmployeeId],
  )

  const dayExpensesForClosing = useMemo(
    () => dayExpenses.filter((expense) => expense.category !== "gasto_especial"),
    [dayExpenses],
  )

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const productsByName = useMemo(() => {
    const entries = products
      .map((product) => [String(product.name || "").trim().toLowerCase(), product] as const)
      .filter(([name]) => Boolean(name))
    return new Map(entries)
  }, [products])
  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales])

  const getSaleGeneralPortion = useCallback(
    (sale: any) => {
      const saleTotal = normalizePositiveAmount(sale?.total)
      const method = normalizePaymentMethod(sale?.paymentMethod)
      const storedAmountPaid = Math.min(saleTotal, normalizePositiveAmount(sale?.amountPaid))
      // Las ventas antiguas de contado pueden no tener amountPaid guardado.
      const amountPaidRaw = storedAmountPaid > 0 || method === "credit" ? storedAmountPaid : saleTotal
      const almacenRatio = getAlmacenRatioFromSale(sale, almacenProductIds)
      const generalRatio = Math.max(0, 1 - almacenRatio)
      const generalTotal = saleTotal * generalRatio
      const generalAmountPaid = method === "credit" ? 0 : amountPaidRaw * generalRatio

      return {
        method,
        generalRatio,
        generalTotal,
        generalAmountPaid,
      }
    },
    [almacenProductIds],
  )

  const getReturnGeneralTotal = useCallback(
    (ret: any) => {
      const returnTotal = normalizePositiveAmount(ret?.total)
      const originalSale = salesById.get(ret?.invoiceId)
      const returnItems = Array.isArray(ret?.items) ? ret.items : []

      if (returnItems.length > 0) {
        let itemsTotal = 0
        let almacenTotal = 0
        let almacenCount = 0
        let nonAlmacenCount = 0

        returnItems.forEach((rawItem: any) => {
          const returnItem = (rawItem ?? {}) as Record<string, unknown>
          const subtotal = getItemSubtotal(returnItem)
          itemsTotal += subtotal

          if (isAlmacenReturnItemRecord(returnItem, originalSale, almacenProductIds)) {
            almacenTotal += subtotal
            almacenCount += 1
          } else {
            nonAlmacenCount += 1
          }
        })

        const almacenRatio =
          itemsTotal > 0
            ? Math.max(0, Math.min(1, almacenTotal / itemsTotal))
            : almacenCount > 0 && nonAlmacenCount === 0
              ? 1
              : 0

        return returnTotal * Math.max(0, 1 - almacenRatio)
      }

      if (!originalSale) return returnTotal
      const salePortion = getSaleGeneralPortion(originalSale)
      return returnTotal * salePortion.generalRatio
    },
    [salesById, getSaleGeneralPortion, almacenProductIds],
  )

  const cashClosingSales = useMemo(
    () =>
      daySales.filter((sale) => {
        if (sale.status === "anulada" || sale.status === "pending") return false
        const generalTotal = getSaleGeneralPortion(sale).generalTotal
        if (generalTotal > 0) return true
        return sale.items.some(
          (item: any) =>
            item?.accountingVersion === 2 &&
            !isAlmacenItemRecord((item ?? {}) as Record<string, unknown>, almacenProductIds),
        )
      }),
    [daySales, getSaleGeneralPortion, almacenProductIds],
  )

  const cashClosingReturns = useMemo(
    () =>
      dayReturns.filter((ret) => {
        if (ret.type === "transferencia") return false
        if (getReturnGeneralTotal(ret) > 0) return true
        const originalSale = salesById.get(ret.invoiceId)
        return Boolean(
          ret.accountingVersion === 2 &&
            ret.returnToInventory !== false &&
            ret.items.some(
              (item: any) =>
                !isAlmacenReturnItemRecord((item ?? {}) as Record<string, unknown>, originalSale, almacenProductIds),
            ),
        )
      }),
    [dayReturns, getReturnGeneralTotal, salesById, almacenProductIds],
  )

  const transferenceReturns = useMemo(
    () =>
      dayReturns.filter((ret) => {
        if (ret.type !== "transferencia") return false
        if (getReturnGeneralTotal(ret) > 0) return true
        const originalSale = salesById.get(ret.invoiceId)
        return Boolean(
          ret.accountingVersion === 2 &&
            ret.returnToInventory !== false &&
            ret.items.some(
              (item: any) =>
                !isAlmacenReturnItemRecord((item ?? {}) as Record<string, unknown>, originalSale, almacenProductIds),
            ),
        )
      }),
    [dayReturns, getReturnGeneralTotal, salesById, almacenProductIds],
  )

  // Apply filters to sales
  const filteredSales = useMemo(() => {
    return cashClosingSales.filter((sale) => {
      if (filterPaymentMethod !== "all" && normalizePaymentMethod(sale.paymentMethod) !== filterPaymentMethod) return false
      if (filterStatus !== "all" && sale.status !== filterStatus) return false
      if (filterHour !== "all") {
        const saleHour = new Date(sale.date).getHours()
        const [start, end] = filterHour.split("-").map(Number)
        if (saleHour < start || saleHour >= end) return false
      }
      return true
    })
  }, [cashClosingSales, filterPaymentMethod, filterStatus, filterHour])

  // Calculate totals by payment method
  const methodTotals = useMemo(() => {
    const methods = {
      cash: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
      card: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
      transfer: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
      credit: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
    }

    cashClosingSales.forEach((sale) => {
      const portion = getSaleGeneralPortion(sale)
      const breakdown = calculateSaleMethodBreakdown(portion.generalTotal, portion.generalAmountPaid, portion.method)
      ;(Object.keys(methods) as PaymentMethodKey[]).forEach((method) => {
        methods[method].sales += breakdown[method]
      })
    })

    cashClosingReturns.forEach((ret) => {
      const returnTotal = getReturnGeneralTotal(ret)
      if (returnTotal <= 0) return

      if (ret.type === "credito") {
        methods.credit.returns += returnTotal
        return
      }

      // Para reembolso y transferencia: distribuir según el método original de pago
      const originalSale = salesById.get(ret.invoiceId)
      if (!originalSale) {
        methods.cash.returns += returnTotal
        return
      }

      const originalPortion = getSaleGeneralPortion(originalSale)
      const isFullCreditSale = originalPortion?.method === "credit" && (originalPortion?.generalTotal || 0) > 0

      if (isFullCreditSale) {
        methods.credit.returns += returnTotal
        return
      }

      const originalBreakdown = calculateSaleMethodBreakdown(
        originalPortion.generalTotal,
        originalPortion.generalAmountPaid,
        originalPortion.method,
      )
      const originalBreakdownTotal = sumMethodBreakdown(originalBreakdown)

      if (originalBreakdownTotal > 0) {
        ;(Object.keys(methods) as PaymentMethodKey[]).forEach((method) => {
          methods[method].returns += (originalBreakdown[method] / originalBreakdownTotal) * returnTotal
        })
        return
      }

      methods[normalizePaymentMethod(originalSale.paymentMethod)].returns += returnTotal
    })

    dayPayments.forEach((payment) => {
      const method = normalizePaymentMethod(payment.paymentMethod)
      methods[method].payments += Number(payment.amount) || 0
    })

    dayRepairs.forEach((repair) => {
      methods.cash.repairs += Number(repair.cost) || 0
    })

    dayExpensesForClosing.forEach((expense) => {
      const method = normalizePaymentMethod(expense.paymentMethod)
      methods[method].expenses += Number(expense.amount) || 0
    })

    return methods
  }, [
    cashClosingSales,
    cashClosingReturns,
    dayPayments,
    dayRepairs,
    dayExpenses,
    salesById,
    getSaleGeneralPortion,
    getReturnGeneralTotal,
  ])

  // Calculate summary totals
  const summary = useMemo(() => {
    const totalSales =
      methodTotals.cash.sales + methodTotals.card.sales + methodTotals.transfer.sales + methodTotals.credit.sales

    const totalReturns =
      methodTotals.cash.returns + methodTotals.card.returns + methodTotals.transfer.returns + methodTotals.credit.returns

    const cashRefunds = cashClosingReturns
      .filter((ret) => ret.type === "reembolso")
      .reduce((sum, ret) => {
        const originalSale = salesById.get(ret.invoiceId)
        const originalPortion = originalSale ? getSaleGeneralPortion(originalSale) : null
        const returnTotal = getReturnGeneralTotal(ret)

        if (returnTotal <= 0) return sum

        if (ret.type === "credito") return sum

        // Si fue una venta completamente a crédito (sin pago):
        // La devolución NO sale de caja; solo ajusta el saldo del cliente.
        const isFullCreditSale =
          originalPortion?.method === "credit" && (originalPortion?.generalTotal || 0) > 0
        if (isFullCreditSale) return sum

        const originalAmountPaid = originalPortion?.generalAmountPaid || 0
        const originalTotal = originalPortion?.generalTotal || 0
        const isPartialCreditSale =
          originalPortion?.method !== "credit" && originalAmountPaid > 0 && originalAmountPaid < originalTotal

        return sum + (isPartialCreditSale ? Math.min(returnTotal, originalAmountPaid) : returnTotal)
      }, 0)

    const totalPayments = dayPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const totalRepairs = dayRepairs.reduce((sum, r) => sum + (Number(r.cost) || 0), 0)
    const totalExpenses = dayExpensesForClosing.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const totalCostoVenta = dayExpensesForClosing
      .filter((e) => e.description && e.description.includes("Costo Venta"))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

    const totalDiscounts = cashClosingSales.reduce((sum, sale) => {
      const subtotalAmount = sale.items.reduce((itemSum, item) => itemSum + ((item.customPrice ?? item.sellPrice ?? 0) * item.quantity), 0)
      const discountAmount = sale.discount !== undefined
        ? sale.discount
        : Math.max(0, subtotalAmount - sale.total)
      return sum + discountAmount * getSaleGeneralPortion(sale).generalRatio
    }, 0)

    let grossProfit = 0
    let totalCOGS = 0

    cashClosingSales.forEach((sale) => {
      if (sale.status === "anulada" || sale.status === "pending") return
      if (!sale.items) return

      // New sales carry the accounting marker in their items. Their revenue
      // must be the collected total after discount, while cost remains the
      // purchase cost of the units delivered.
      if (sale.items.some((item: any) => item?.accountingVersion === 2)) {
        const generalItems = sale.items.filter((item: any) => {
          const itemRecord = (item ?? {}) as Record<string, unknown>
          return !isAlmacenItemRecord(itemRecord, almacenProductIds)
        })
        const generalCost = generalItems.reduce((sum, item: any) => {
          const cost = Number(item?.buyPrice ?? item?.cost ?? 0)
          const quantity = Number(item?.quantity || 1)
          return sum + (Number.isFinite(cost) ? cost : 0) * (Number.isFinite(quantity) ? quantity : 0)
        }, 0)
        grossProfit += getSaleGeneralPortion(sale).generalTotal - generalCost
        totalCOGS += generalCost
        return
      }

      sale.items.forEach((item: any) => {
        const itemRecord = (item ?? {}) as Record<string, unknown>
        if (isAlmacenItemRecord(itemRecord, almacenProductIds)) return

        const cost = Number(itemRecord.buyPrice ?? itemRecord.cost ?? 0)
        const price = Number(itemRecord.customPrice ?? itemRecord.sellPrice ?? itemRecord.price ?? 0)
        const quantity = Number(itemRecord.quantity || 1)
        const safeCost = Number.isFinite(cost) ? cost : 0
        const safePrice = Number.isFinite(price) ? price : 0
        const safeQty = Number.isFinite(quantity) ? quantity : 0

        const profit = (safePrice - safeCost) * safeQty
        grossProfit += profit
        totalCOGS += safeCost * safeQty
      })
    })

    let reversedProfit = 0
    cashClosingReturns.forEach((ret) => {
      if (!ret.items) return
      const originalSale = salesById.get(ret.invoiceId)

      ret.items.forEach((item: any) => {
        const itemRecord = (item ?? {}) as Record<string, unknown>
        if (isAlmacenReturnItemRecord(itemRecord, originalSale, almacenProductIds)) return

        const price = Number(itemRecord.unitPrice ?? itemRecord.sellPrice ?? itemRecord.price ?? 0)
        const quantity = Number(itemRecord.quantity || 1)
        let cost = 0

        if (itemRecord.buyPrice) {
          cost = Number(itemRecord.buyPrice)
        } else {
          const itemId = getItemId(itemRecord)
          const byId = itemId ? productsById.get(itemId) : undefined
          const byName = getItemName(itemRecord) ? productsByName.get(getItemName(itemRecord) as string) : undefined
          const product = byId || byName
          if (product) {
            cost = Number(product.buyPrice)
          }
        }

        const safePrice = Number.isFinite(price) ? price : 0
        const safeQty = Number.isFinite(quantity) ? quantity : 0
        const safeCost = Number.isFinite(cost) ? cost : 0
        const returnToStock = ret.returnToInventory !== false

        if (returnToStock) {
          reversedProfit += (safePrice - safeCost) * safeQty
        } else {
          reversedProfit += safePrice * safeQty
        }
      })
    })

    const opening = Number(openingBalance) || 0
    const expectedCash =
      opening + methodTotals.cash.sales + methodTotals.cash.payments + totalRepairs - cashRefunds - methodTotals.cash.expenses

    const estimatedProfit = grossProfit - reversedProfit
    const netProfit = estimatedProfit - totalExpenses

    return {
      totalSales,
      totalReturns,
      cashRefunds,
      totalPayments,
      totalRepairs,
      totalExpenses,
      totalCostoVenta,
      totalDiscounts,
      estimatedProfit,
      expectedCash,
      netIncome: totalSales - totalReturns + totalPayments + totalRepairs - totalExpenses,
      netProfit,
      totalCOGS,
      invoiceCount: cashClosingSales.filter((s) => s.status !== "anulada" && s.status !== "pending").length,
      creditSales: methodTotals.credit.sales,
    }
  }, [
    methodTotals,
    cashClosingReturns,
    dayPayments,
    dayRepairs,
    dayExpenses,
    cashClosingSales,
    openingBalance,
    salesById,
    getSaleGeneralPortion,
    getReturnGeneralTotal,
    almacenProductIds,
    productsById,
    productsByName,
  ])

  // Calculate counted amount
  const countedAmount = Number(manualCountedAmount) || 0

  const discrepancy = summary.expectedCash - countedAmount
  const netCashInFlow = methodTotals.cash.sales + methodTotals.cash.payments - summary.cashRefunds

  // Pie chart data
  const pieChartData = [
    { name: "Efectivo", value: methodTotals.cash.sales, color: COLORS.cash },
    { name: "Tarjeta", value: methodTotals.card.sales, color: COLORS.card },
    { name: "Transferencia", value: methodTotals.transfer.sales, color: COLORS.transfer },
    { name: "Crédito", value: methodTotals.credit.sales, color: COLORS.credit },
  ].filter((d) => d.value > 0)

  // Sales by hour chart data
  const salesByHour = useMemo(() => {
    const hours: Record<number, number> = {}
    for (let i = 8; i <= 20; i++) hours[i] = 0

    cashClosingSales.forEach((sale) => {
      const hour = new Date(sale.date).getHours()
      if (hours[hour] !== undefined) {
        hours[hour] += getSaleGeneralPortion(sale).generalTotal
      }
    })

    return Object.entries(hours).map(([hour, total]) => ({
      hour: `${hour}:00`,
      ventas: total,
    }))
  }, [cashClosingSales, getSaleGeneralPortion])

  // Add expense
  const handleAddExpense = async () => {
    if (!expenseDescription || !expenseAmount) {
      toast({ title: "Error", description: "Complete todos los campos", variant: "destructive" })
      return
    }

    try {
      await addExpense({
        date: selectedDate,
        description: expenseDescription,
        amount: Number(expenseAmount),
        category: expenseCategory,
        paymentMethod: expensePaymentMethod,
        userName: currentUser?.name || "Sistema",
        userId: currentUser?.id,
      })

      toast({ title: "Exito", description: "Gasto registrado correctamente" })
      setShowExpenseDialog(false)
      setExpenseDescription("")
      setExpenseAmount("")
      // loadData() // No needed, realtime updates
    } catch (error) {
      toast({ title: "Error", description: "No se pudo registrar el gasto", variant: "destructive" })
    }
  }

  // Delete expense
  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpense(id)
      toast({ title: "Gasto eliminado" })
      // loadData() // No needed
    } catch (error) {
      toast({ title: "Error", variant: "destructive" })
    }
  }

  // Handle download history closing
  const handleDownloadHistory = async (closing: CashClosing) => {
    try {
      // 1. Filter data for the closing date
      const closingDate = closing.date
      const targetSales = sales.filter((s) => s.date.startsWith(closingDate))
      const targetReturns = returns.filter((r) => r.date.startsWith(closingDate))
      const targetPayments = payments.filter((p) => p.date.startsWith(closingDate))
      const targetRepairs = repairs.filter((r) => r.date.startsWith(closingDate))
      const targetExpenses = expenses.filter((e) => e.date === closingDate)

      // 2. Calculate totals
      const methods = {
        cash: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
        card: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
        transfer: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
        credit: { sales: 0, returns: 0, payments: 0, repairs: 0, expenses: 0 },
      }

      // Exclude cancelled/pending sales and ignore pure almacen sales.
      const validTargetSales = targetSales.filter(
        (s) => s.status !== "anulada" && s.status !== "pending" && getSaleGeneralPortion(s).generalTotal > 0,
      )
      const validTargetReturns = targetReturns.filter((r) => getReturnGeneralTotal(r) > 0)
      validTargetSales.forEach((sale) => {
        const portion = getSaleGeneralPortion(sale)
        const method = portion.method
        const amountPaid = portion.generalAmountPaid
        const total = portion.generalTotal
        const isPartialCreditSale = method !== "credit" && amountPaid > 0 && amountPaid < total

        if (isPartialCreditSale) {
          methods[method].sales += amountPaid
          methods.credit.sales += total - amountPaid
        } else {
          methods[method].sales += total
        }
      })

      // 3. Generate PDF
      const pdfBlob = await generateCashClosingPDF({
        date: closing.date,
        closingNumber: closing.closing_number,
        cashier: closing.cashier_name,
        openingBalance: Number(closing.opening_balance) || 0,
        sales: {
          cash: methods.cash.sales,
          card: methods.card.sales,
          transfer: methods.transfer.sales,
          credit: methods.credit.sales,
          total: Number(closing.total_sales) || 0,
          count: validTargetSales.length,
        },
        returns: { total: Number(closing.total_returns) || 0, count: validTargetReturns.length },
        payments: { total: Number(closing.total_payments) || 0, count: targetPayments.length },
        repairs: { total: Number(closing.total_repairs) || 0, count: targetRepairs.length },
        expectedAmount: Number(closing.expected_amount) || 0,
        countedAmount: Number(closing.counted_amount) || 0,
        discrepancy: Number(closing.discrepancy) || 0,
        notes: closing.notes,
        transactions: {
          invoices: validTargetSales.map((s) => {
            const portion = getSaleGeneralPortion(s)
            return {
              number: s.invoiceNumber || "N/A",
              method: s.paymentMethod || "cash",
              total: portion.generalTotal,
            }
          }),
          returns: validTargetReturns.map((r) => ({
            number: r.returnNumber || "N/A",
            invoiceNumber: r.invoiceNumber || "N/A",
            total: getReturnGeneralTotal(r),
          })),
          payments: targetPayments.map((p) => ({
            number: p.invoiceNumber || "N/A",
            amount: Number(p.amount) || 0,
          })),
        },
      }, currentUser?.adminId)

      // 4. Download
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cierre-${closing.closing_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        description: "PDF descargado correctamente",
      })
    } catch (error) {
      console.error("Error generating history PDF:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el PDF",
        variant: "destructive",
      })
    }
  }

  // Process closing
  const handleClosing = async () => {
    if (todayClosingExists) {
      toast({
        title: "Error",
        description: selectedEmployee
          ? `Ya existe un cierre para el empleado ${selectedEmployee.name} en esta fecha`
          : "Ya existe un cierre general para esta fecha",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    try {
      const closingNumber = generateClosingNumber()

      const targetCashierName = selectedEmployee
        ? selectedEmployee.name
        : currentUser?.name
          ? `${currentUser.name} (Cierre General)`
          : "Cierre General"

      const targetCashierId = selectedEmployee ? selectedEmployee.id : currentUser?.id

      const closingData = {
        owner_admin_id: currentUser?.adminId || currentUser?.id,
        closing_number: closingNumber,
        date: selectedDate,
        start_time: startTime.toISOString(),
        end_time: new Date().toISOString(),
        cashier_id: targetCashierId,
        cashier_name: targetCashierName,
        opening_balance: Number(openingBalance) || 0,
        total_sales: summary.totalSales,
        sales_cash: methodTotals.cash.sales,
        sales_card: methodTotals.card.sales,
        sales_transfer: methodTotals.transfer.sales,
        sales_credit: methodTotals.credit.sales,
        sales_count: summary.invoiceCount,
        total_returns: summary.totalReturns,
        returns_count: cashClosingReturns.length,
        total_payments: summary.totalPayments,
        payments_count: dayPayments.length,
        total_repairs: summary.totalRepairs,
        repairs_count: dayRepairs.length,
        total_expenses: summary.totalExpenses,
        expenses_count: dayExpenses.length,
        denomination_counts: {},
        expected_amount: summary.expectedCash,
        counted_amount: countedAmount,
        discrepancy: discrepancy,
        status: discrepancy === 0 ? "approved" : "pending",
        notes: closingNotes,
      }

      // Generate PDF
      const pdfBlob = await generateCashClosingPDF({
        date: selectedDate,
        closingNumber,
        cashier: targetCashierName,
        openingBalance: Number(openingBalance) || 0,
        sales: {
          cash: methodTotals.cash.sales,
          card: methodTotals.card.sales,
          transfer: methodTotals.transfer.sales,
          credit: methodTotals.credit.sales,
          total: summary.totalSales,
          count: summary.invoiceCount,
        },
        returns: { total: summary.totalReturns, count: cashClosingReturns.length },
        payments: { total: summary.totalPayments, count: dayPayments.length },
        repairs: { total: summary.totalRepairs, count: dayRepairs.length },
        expectedAmount: summary.expectedCash,
        countedAmount,
        discrepancy,
        notes: closingNotes,
        transactions: {
          invoices: cashClosingSales.map((s) => ({
            number: s.invoiceNumber || "N/A",
            method: s.paymentMethod || "cash",
            total: getSaleGeneralPortion(s).generalTotal,
          })),
          returns: cashClosingReturns.map((r) => ({
            number: r.returnNumber || "N/A",
            invoiceNumber: r.invoiceNumber || "N/A",
            total: getReturnGeneralTotal(r),
          })),
          payments: dayPayments.map((p) => ({
            number: p.invoiceNumber || "N/A",
            amount: Number(p.amount) || 0,
          })),
        },
      }, currentUser?.adminId)

      // Save to database
      const { error } = await supabase.from("cash_closings").insert(closingData)

      if (error) throw error

      // Download PDF
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cierre-${closingNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      toast({
        description: `Cierre ${closingNumber} (${targetCashierName}) procesado exitosamente`,
      })

      // Imprimir ticket térmico automáticamente
      void printCashClosingTicket(
        {
          closingNumber,
          date: selectedDate,
          cashierName: targetCashierName,
          openingBalance: Number(openingBalance) || 0,
          totalSales: summary.totalSales,
          salesByMethod: {
            cash: methodTotals.cash.sales,
            card: methodTotals.card.sales,
            transfer: methodTotals.transfer.sales,
            credit: methodTotals.credit.sales,
          },
          totalReturns: summary.totalReturns,
          totalPayments: summary.totalPayments,
          totalRepairs: summary.totalRepairs,
          totalExpenses: summary.totalExpenses,
          expectedCash: summary.expectedCash,
          countedCash: countedAmount,
          discrepancy,
        },
        undefined,
        currentUser?.adminId,
      )

      setShowClosingDialog(false)
      loadData()
    } catch (error) {
      console.log("[v0] Error processing closing:", error)
      toast({
        title: "Error",
        description: "No se pudo procesar el cierre",
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
          <Badge className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aprobado
          </Badge>
        )
      case "pending":
        return (
          <Badge className="bg-yellow-500">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        )
      case "rejected":
        return (
          <Badge className="bg-red-500">
            <XCircle className="h-3 w-3 mr-1" />
            Rechazado
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <Calculator className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  Cierre de Caja
                  <Badge variant="outline" className="ml-2 border-blue-400 text-blue-400">
                    {new Date(selectedDate).toLocaleDateString("es-DO", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Badge>
                </h1>
                <div className="flex items-center gap-4 text-slate-400 text-sm mt-1">
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

            <div className="flex flex-wrap items-center gap-3">
              <Select value={currentYear} onValueChange={setCurrentYear}>
                <SelectTrigger className="w-[100px] bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Año" />
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
                <SelectTrigger className="w-[120px] bg-slate-700 border-slate-600 text-white">
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
                <SelectTrigger className="w-[100px] bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Día" />
                </SelectTrigger>
                <SelectContent>
                  {days.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-[190px] bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Empleado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los empleados</SelectItem>
                  {employeeOptions.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}{employee.id === currentUser?.id ? " (Actual)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="border-slate-600 text-black hover:bg-slate-700 hover:text-white bg-transparent"
                asChild
              >
                <Link to="/">
                  <Home className="h-4 w-4 mr-2" />
                  Panel
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Alert if closing exists */}
        {todayClosingExists && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Ya existe un cierre para esta fecha</p>
              <p className="text-sm text-yellow-600">
                No se puede realizar otro cierre. Consulte el historial para ver los detalles.
              </p>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Total Facturado */}
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-medium">Total Facturado</p>
                  <p className="text-2xl font-bold">${formatCurrency(summary.totalSales)}</p>
                  <p className="text-green-100 text-xs">{daySales.length} facturas</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Efectivo */}
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-xs font-medium">En Efectivo</p>
                  <p className="text-2xl font-bold">${formatCurrency(netCashInFlow)}</p>
                  <p className="text-emerald-100 text-xs">Ventas + Pagos deuda - Devoluciones en efectivo</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Banknote className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tarjeta */}
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium">En Tarjeta</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(methodTotals.card.sales + methodTotals.card.payments - methodTotals.card.returns)}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transferencia */}
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-xs font-medium">Transferencias</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(
                      methodTotals.transfer.sales + methodTotals.transfer.payments - methodTotals.transfer.returns,
                    )}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <ArrowRightLeft className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Crédito */}
          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-xs font-medium">A Crédito</p>
                  <p className="text-2xl font-bold">
                    ${formatCurrency(methodTotals.credit.sales + methodTotals.credit.payments - methodTotals.credit.returns)}
                  </p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Devoluciones */}
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-xs font-medium">Devoluciones</p>
                  <p className="text-2xl font-bold">-${formatCurrency(summary.totalReturns)}</p>
                  <p className="text-red-100 text-xs">{cashClosingReturns.length} devoluciones</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transferencias */}
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-xs font-medium">Transferencias</p>
                  <p className="text-2xl font-bold">-${formatCurrency(transferenceReturns.reduce((sum, ret) => sum + (getReturnGeneralTotal(ret) || 0), 0))}</p>
                  <p className="text-purple-100 text-xs">{transferenceReturns.length} transferencias</p>
                </div>
                <div className="p-2 bg-white/20 rounded-lg">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Second Row - Additional Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagos de Deuda</p>
                  <p className="text-xl font-bold text-blue-600">+${formatCurrency(summary.totalPayments)}</p>
                  <p className="text-xs text-muted-foreground">{dayPayments.length} pagos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <ArrowDownRight className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gastos del Dia</p>
                  <p className="text-xl font-bold text-orange-600">-${formatCurrency(summary.totalExpenses)}</p>
                  <p className="text-xs text-muted-foreground">{dayExpenses.length} gastos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-gradient-to-br from-slate-800 to-slate-900 text-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-300">Ingreso Neto</p>
                  <p className="text-xl font-bold">${formatCurrency(summary.netIncome)}</p>
                  <p className="text-xs text-slate-400">Balance del dia</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>



        {/* Main Content Tabs */}
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
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => setShowClosingDialog(true)}
                disabled={todayClosingExists || isProcessing}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                <Lock className="h-4 w-4 mr-2" />
                Realizar Cierre
              </Button>
            </div>
          </div>

          {/* Resumen Tab */}
          <TabsContent value="resumen" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
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
                              <Cell key={`cell-${index}`} fill={entry.color} />
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

              {/* Sales by Hour Chart */}
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
                        <YAxis fontSize={10} tickFormatter={(v) => `$${v}`} />
                        <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                        <Bar dataKey="ventas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Breakdown Table */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Desglose Detallado por Metodo de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Metodo</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Devoluciones</TableHead>
                      <TableHead className="text-right">Pagos</TableHead>
                      <TableHead className="text-right">Reparaciones</TableHead>
                      <TableHead className="text-right">Gastos</TableHead>
                      <TableHead className="text-right font-bold">Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(methodTotals).map(([method, totals]) => {
                      const net = totals.sales - totals.returns + totals.payments + totals.repairs - totals.expenses
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
                                    : "Crédito"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-green-600">${totals.sales.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-red-600">-${totals.returns.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-blue-600">
                            +${totals.payments.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-purple-600">
                            ${totals.repairs.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            -${totals.expenses.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-bold">${net.toLocaleString()}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-slate-100 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right text-green-600">
                        ${summary.totalSales.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        -${summary.totalReturns.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        +${summary.totalPayments.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-purple-600">
                        ${summary.totalRepairs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        -${summary.totalExpenses.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">${summary.netIncome.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Movimientos Tab */}
          <TabsContent value="movimientos" className="space-y-4">
            {/* Filters */}
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
                      <SelectItem value="credit">Crédito</SelectItem>
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

            {/* Invoices Table */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Facturas del Dia ({filteredSales.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Factura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1">Metodo</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1 text-right">Total</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1">Estado</TableHead>
                        <TableHead className="w-[1%] whitespace-nowrap px-1 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono font-medium">
                              <div className="text-xs text-gray-600 max-w-[200px]">
                                {Array.isArray(sale.items) && sale.items.length > 0 ? (
                                  sale.items.map((item: any) => item?.productName || item?.name).join(", ")
                                ) : (
                                  sale.invoiceNumber || sale.invoice_number
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{sale.customer_name || "Cliente General"}</TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1">
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor: COLORS[sale.paymentMethod as keyof typeof COLORS] || COLORS.cash,
                                  color: COLORS[sale.paymentMethod as keyof typeof COLORS] || COLORS.cash,
                                }}
                              >
                                {sale.paymentMethod === "cash"
                                  ? "Efectivo"
                                  : sale.paymentMethod === "card"
                                    ? "Tarjeta"
                                    : sale.paymentMethod === "transfer"
                                      ? "Transferencia"
                                      : "Crédito"}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1 text-right font-bold">
                              ${getSaleGeneralPortion(sale).generalAmountPaid.toLocaleString()}
                            </TableCell>
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
                                    ? "Crédito"
                                    : sale.status === "pending"
                                      ? "Pendiente"
                                      : sale.status === "anulada" || sale.status === "cancelled"
                                        ? "Cancelada"
                                        : "Devuelta"}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap px-1 text-right">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                      onClick={() => {
                                        const generalTotal = getSaleGeneralPortion(sale).generalTotal
                                        setSelectedSale({
                                          ...sale,
                                          number: sale.invoiceNumber,
                                          amount: generalTotal,
                                        })
                                        setShowDetailsDialog(true)
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Ver Detalles</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No hay facturas que mostrar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Returns and Payments */}
            <Card className="shadow-lg">
              <CardHeader className="space-y-4">
                <CardTitle>Movimientos del día</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={activeMovement === "returns" ? "default" : "outline"} className={activeMovement === "returns" ? "bg-red-600 hover:bg-red-700" : ""} onClick={() => setActiveMovement("returns")}>
                    <TrendingDown className="h-4 w-4 mr-2" /> Devoluciones ({cashClosingReturns.length})
                  </Button>
                  <Button type="button" size="sm" variant={activeMovement === "transfers" ? "default" : "outline"} className={activeMovement === "transfers" ? "bg-purple-600 hover:bg-purple-700" : ""} onClick={() => setActiveMovement("transfers")}>
                    <CreditCard className="h-4 w-4 mr-2" /> Devoluciones transferencia ({transferenceReturns.length})
                  </Button>
                  <Button type="button" size="sm" variant={activeMovement === "payments" ? "default" : "outline"} className={activeMovement === "payments" ? "bg-blue-600 hover:bg-blue-700" : ""} onClick={() => setActiveMovement("payments")}>
                    <Receipt className="h-4 w-4 mr-2" /> Pagos de deuda ({dayPayments.length})
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4">
              {/* Returns */}
              {activeMovement === "returns" && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-5 w-5" />
                    Devoluciones ({cashClosingReturns.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Devolución</TableHead>
                          <TableHead>Factura</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Usuario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashClosingReturns.length > 0 ? (
                          cashClosingReturns.map((ret) => (
                            <TableRow key={ret.id}>
                              <TableCell className="font-mono">{ret.returnNumber}</TableCell>
                              <TableCell>{ret.invoiceNumber}</TableCell>
                              <TableCell className="text-right text-red-600 font-bold">
                                -${(Number(ret.total) || 0).toLocaleString()}
                              </TableCell>
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
              )}

              {/* Transferencias */}
              {activeMovement === "transfers" && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-600">
                    <CreditCard className="h-5 w-5" />
                    Transferencias ({transferenceReturns.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Devolución</TableHead>
                          <TableHead>Factura</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Usuario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transferenceReturns.length > 0 ? (
                          transferenceReturns.map((ret) => (
                            <TableRow key={ret.id}>
                              <TableCell className="font-mono">{ret.returnNumber}</TableCell>
                              <TableCell>{ret.invoiceNumber}</TableCell>
                              <TableCell className="text-right text-purple-600 font-bold">
                                -${(Number(ret.total) || 0).toLocaleString()}
                              </TableCell>
                              <TableCell>{ret.processed_by || "Sistema"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                              No hay transferencias
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
              )}

              {/* Payments */}
              {activeMovement === "payments" && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Receipt className="h-5 w-5" />
                    Pagos de Deuda ({dayPayments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="text-right">Deuda Ant.</TableHead>
                          <TableHead className="text-right">Restante</TableHead>
                          <TableHead>Realizado por</TableHead>
                          <TableHead className="text-center">Detalles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayPayments.length > 0 ? (
                          dayPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="font-medium">
                                {getCustomerName(payment.customerId)}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-bold">
                                +${(Number(payment.amount) || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                ${(Number(payment.previousDebt) || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                ${(Number(payment.remainingDebt) || 0).toLocaleString()}
                              </TableCell>
                              <TableCell>{getPaymentResponsibleName(payment)}</TableCell>
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
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                              No hay pagos
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
              )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conteo de Caja Tab */}
          <TabsContent value="conteo" className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Registro de Caja */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-500" />
                    Registro de Caja
                  </CardTitle>
                  <CardDescription>Resumen de movimientos de efectivo del dia</CardDescription>
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
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        className="pl-9 text-lg"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm">+ Ventas en Efectivo</span>
                      <span className="font-bold text-green-600">${methodTotals.cash.sales.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm">+ Pagos de Deuda (Efectivo)</span>
                      <span className="font-bold text-blue-600">${methodTotals.cash.payments.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="text-sm">+ Reparaciones</span>
                      <span className="font-bold text-purple-600">${summary.totalRepairs.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                      <span className="text-sm">- Devoluciones en Efectivo</span>
                      <span className="font-bold text-red-600">-${summary.cashRefunds.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="text-sm">- Devoluciones por Transferencia</span>
                      <span className="font-bold text-purple-600">
                        -${transferenceReturns.reduce((sum, ret) => sum + (getReturnGeneralTotal(ret) || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                      Las devoluciones por transferencia se muestran como referencia y no descuentan el efectivo de caja.
                    </p>
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-sm">- Gastos</span>
                      <span className="font-bold text-orange-600">-${summary.totalExpenses.toLocaleString()}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="p-4 bg-slate-900 text-white rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">TOTAL ESPERADO EN CAJA</span>
                      <span className="text-2xl font-bold">${summary.expectedCash.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conteo Fisico */}
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
                          onChange={(e) => setManualCountedAmount(e.target.value)}
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
                      <span className="text-xl font-bold text-blue-600">${countedAmount.toLocaleString()}</span>
                    </div>

                    <div
                      className={`flex justify-between items-center p-4 rounded-lg ${discrepancy === 0 ? "bg-green-100" : discrepancy > 0 ? "bg-red-100" : "bg-orange-100"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        {discrepancy === 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : discrepancy > 0 ? (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                        )}
                        <span className="font-medium">
                          {discrepancy === 0 ? "Cuadrado" : discrepancy > 0 ? "Faltante" : "Sobrante"}
                        </span>
                      </div>
                      <span
                        className={`text-xl font-bold ${discrepancy === 0 ? "text-green-600" : discrepancy > 0 ? "text-red-600" : "text-orange-600"
                          }`}
                      >
                        ${Math.abs(discrepancy).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Gastos Tab */}
          <TabsContent value="gastos" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-orange-500" />
                    Gastos del Dia
                  </CardTitle>
                  <CardDescription>Registro de egresos y gastos operativos</CardDescription>
                </div>
                {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canEdit) && (
                  <Button onClick={() => setShowExpenseDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Gasto
                  </Button>
                )}
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
                      <TableHead className="w-[50px]"></TableHead>
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
                                    : expense.category === "gasto_especial"
                                      ? "Gasto especial"
                                    : "Otros"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600">
                            -${(Number(expense.amount) || 0).toLocaleString()}
                          </TableCell>
                          <TableCell>{expense.paymentMethod === "cash" ? "Efectivo" : "Otro"}</TableCell>
                          <TableCell>{expense.createdAt ? new Date(expense.createdAt).toLocaleTimeString() : ""}</TableCell>
                          <TableCell>{expense.userName}</TableCell>
                          <TableCell>
                            {(currentUser?.role === "admin" || employees.find(e => e.email === currentUser?.email)?.permissions.canDelete) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => {
                                  setExpenseToDelete(expense.id)
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    -${summary.totalExpenses.toLocaleString()}
                  </span>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Historial Tab */}
          <TabsContent value="historial" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-500" />
                  Historial de Cierres
                </CardTitle>
                <CardDescription>Ultimos 30 cierres de caja realizados</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Cierre</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cajero</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Esperado</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashClosings.length > 0 ? (
                        cashClosings.map((closing) => (
                          <TableRow key={closing.id}>
                            <TableCell className="font-mono font-medium">{closing.closing_number}</TableCell>
                            <TableCell>{new Date(closing.date).toLocaleDateString()}</TableCell>
                            <TableCell>{closing.cashier_name}</TableCell>
                            <TableCell className="text-right">
                              ${(Number(closing.total_sales) || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              ${(Number(closing.expected_amount) || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              ${(Number(closing.counted_amount) || 0).toLocaleString()}
                            </TableCell>
                            <TableCell
                              className={`text-right font-bold ${Number(closing.discrepancy) === 0
                                ? "text-green-600"
                                : Number(closing.discrepancy) > 0
                                  ? "text-red-600"
                                  : "text-orange-600"
                                }`}
                            >
                              ${Math.abs(Number(closing.discrepancy) || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>{getStatusBadge(closing.status)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadHistory(closing)}
                                title="Descargar PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No hay cierres registrados
                          </TableCell>
                        </TableRow>
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
            <DialogTitle>Detalles del Pago de Deuda</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Cliente</p>
                <p className="text-lg font-semibold">{getCustomerName(selectedPayment.customerId)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Monto</p>
                  <p className="text-2xl font-bold text-green-600">${(Number(selectedPayment.amount) || 0).toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Método de Pago</p>
                  <p className="text-lg font-semibold">
                    {selectedPayment.paymentMethod === "cash"
                      ? "Efectivo"
                      : selectedPayment.paymentMethod === "card"
                        ? "Tarjeta"
                        : selectedPayment.paymentMethod === "transfer"
                          ? "Transferencia"
                          : "Crédito"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Deuda Anterior</p>
                  <p className="text-lg font-bold">${(Number(selectedPayment.previousDebt) || 0).toLocaleString()}</p>
                </div>
                <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Deuda Restante</p>
                  <p className="text-lg font-bold">${(Number(selectedPayment.remainingDebt) || 0).toLocaleString()}</p>
                </div>
              </div>

              {selectedPayment.invoiceNumber && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Número de Factura/Pago</p>
                  <p className="text-base font-mono">{selectedPayment.invoiceNumber}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Realizado por</p>
                <p className="text-base font-semibold">{getPaymentResponsibleName(selectedPayment)}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPayment(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Gasto</DialogTitle>
            <DialogDescription>Agregue un nuevo gasto o egreso del dia</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Input
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="Ej: Compra de suministros"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="pl-9"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operativo">Operativo</SelectItem>
                    <SelectItem value="suministros">Suministros</SelectItem>
                      <SelectItem value="servicios">Servicios</SelectItem>
                    <SelectItem value="gasto_especial">Gasto especial</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Metodo de Pago</Label>
              <Select value={expensePaymentMethod} onValueChange={setExpensePaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddExpense}>Guardar Gasto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closing Dialog */}
      <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Lock className="h-5 w-5 text-primary" />
              Confirmar Cierre de Caja
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span>Esta acción registrará el cierre de caja y generará el reporte impreso.</span>
              <div className="pt-1 text-sm font-semibold text-primary flex items-center justify-between border-b pb-2">
                <span>
                  {selectedEmployee ? (
                    <span>Cierre de Turno: <strong className="text-foreground">{selectedEmployee.name}</strong></span>
                  ) : (
                    <span>Cierre General: <strong className="text-foreground">Todos los Empleados y Administradores</strong></span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground font-normal">Fecha: {selectedDate}</span>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Desglose de Ventas */}
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-800 flex justify-between items-center text-xs uppercase tracking-wider border-b">
                <span>1. Desglose de Facturación y Ventas</span>
                <Badge variant="secondary">{summary.invoiceCount} Facturas</Badge>
              </div>
              <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50">
                <div className="p-2 border rounded bg-white">
                  <p className="text-xs text-muted-foreground">Efectivo</p>
                  <p className="font-bold text-green-700">{formatCurrency(methodTotals.cash.sales)}</p>
                </div>
                <div className="p-2 border rounded bg-white">
                  <p className="text-xs text-muted-foreground">Tarjeta</p>
                  <p className="font-bold text-blue-700">{formatCurrency(methodTotals.card.sales)}</p>
                </div>
                <div className="p-2 border rounded bg-white">
                  <p className="text-xs text-muted-foreground">Transferencia</p>
                  <p className="font-bold text-purple-700">{formatCurrency(methodTotals.transfer.sales)}</p>
                </div>
                <div className="p-2 border rounded bg-white">
                  <p className="text-xs text-muted-foreground">Crédito</p>
                  <p className="font-bold text-orange-700">{formatCurrency(methodTotals.credit.sales)}</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-slate-100 border-t flex justify-between items-center font-bold">
                <span>Monto Total Ventas:</span>
                <span className="text-green-700 text-base">{formatCurrency(summary.totalSales)}</span>
              </div>
            </div>

            {/* Desglose de Movimientos de Caja */}
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-800 text-xs uppercase tracking-wider border-b">
                2. Flujo de Caja y Otros Movimientos
              </div>
              <div className="p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(+) Fondo Inicial (Caja)</span>
                  <span className="font-semibold">{formatCurrency(Number(openingBalance) || 0)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(+) Ventas en Efectivo</span>
                  <span className="font-semibold text-green-600">{formatCurrency(methodTotals.cash.sales)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(+) Abonos de Deuda (Cobros)</span>
                  <span className="font-semibold text-amber-600">{formatCurrency(summary.totalPayments)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(+) Reparaciones / Servicios</span>
                  <span className="font-semibold text-purple-600">{formatCurrency(summary.totalRepairs)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(-) Devoluciones en Efectivo</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(summary.cashRefunds)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1.5">
                  <span className="text-muted-foreground">(-) Gastos del Día</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(summary.totalExpenses)}</span>
                </div>
              </div>
            </div>

            {/* Resumen Final / Cuadre */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900 text-white rounded-lg">
              <div>
                <p className="text-xs text-slate-400">Efectivo Esperado</p>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(summary.expectedCash)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Efectivo Contado</p>
                <p className="text-lg font-bold text-white">{formatCurrency(countedAmount)}</p>
              </div>
            </div>

            {/* Discrepancy Alert */}
            <div
              className={`p-3 rounded-lg flex items-center gap-3 ${
                discrepancy === 0
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : discrepancy > 0
                    ? "bg-red-100 text-red-800 border border-red-300"
                    : "bg-orange-100 text-orange-800 border border-orange-300"
              }`}
            >
              {discrepancy === 0 ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
              <div>
                <p className="font-bold text-sm">
                  {discrepancy === 0
                    ? "Caja Cuadrada Perfectamente"
                    : discrepancy > 0
                      ? `Faltante en Caja: $${discrepancy.toLocaleString()}`
                      : `Sobrante en Caja: $${Math.abs(discrepancy).toLocaleString()}`}
                </p>
                <p className="text-xs opacity-80">
                  {discrepancy === 0 ? "El efectivo reportado coincide exactamente con el sistema." : "Se requiere revisión y observación del supervisor."}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Comentarios / Observaciones</Label>
              <Textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Agregue notas sobre anomalías, explicaciones de diferencias, etc."
                rows={2}
                className="text-xs"
              />
            </div>

            {/* Signatures placeholder */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="text-center">
                <div className="h-10 border-b border-dashed border-slate-300 mb-1"></div>
                <p className="text-[11px] text-muted-foreground">Firma del Cajero</p>
              </div>
              <div className="text-center">
                <div className="h-10 border-b border-dashed border-slate-300 mb-1"></div>
                <p className="text-[11px] text-muted-foreground">Firma del Supervisor</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowClosingDialog(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleClosing}
              disabled={isProcessing}
              className="bg-gradient-to-r from-blue-600 to-blue-700"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Confirmar Cierre
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Expense Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Esto eliminara permanentemente el gasto registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExpenseToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (expenseToDelete) {
                  handleDeleteExpense(expenseToDelete)
                  setExpenseToDelete(null)
                  setShowDeleteDialog(false)
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaleDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        sale={selectedSale}
      />
    </div>
  )
}
