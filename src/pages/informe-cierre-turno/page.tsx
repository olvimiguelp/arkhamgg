"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import {
  BarChart3,
  DollarSign,
  Clock,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  History,
  Calendar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useStore, type Payment, type Sale } from "@/components/store-context"
import { useRealtimeTableRefresh } from "@/hooks/use-realtime-table-refresh"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { normalizePaymentMethod, type PaymentMethod } from "@/lib/transaction-classification"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeSalesSummary {
  employeeId: string
  employeeName: string
  employeeEmail: string
  totalSales: number
  cashTotal: number
  cardTotal: number
  transferTotal: number
  creditTotal: number
  saleCount: number
  lastSaleTime?: string
  isActive: boolean
  sessionId?: string
  sessionOpenedAt?: string
  sessionClosedAt?: string | null
  sessionStatus?: "open" | "closed"
  openingCash?: number
  openingCashConfirmed: boolean
  closingCash?: number | null
  closingCashConfirmed: boolean
  debtPaymentTotal: number
  cashDebtPaymentTotal: number
  cashSalesTotal: number
  cashReturnsTotal: number
  transferReturnsTotal: number
  repairsTotal: number
  expenseTotal: number
  expectedCash: number
}

interface TurnSession {
  id: string
  employee_id: string
  employee_name: string
  date: string
  opened_at: string
  closed_at: string | null
  status: "open" | "closed"
  opening_cash: number
  opening_cash_confirmed: boolean
  closing_cash: number | null
  cash_total: number
  card_total: number
  transfer_total: number
  credit_total: number
  total_sales: number
  sale_count: number
  notes: string | null
  created_at: string
}

interface ReportDebtPayment {
  amount: number
  date: string
  paymentMethod: PaymentMethod
  createdByEmployeeId?: string
  createdByEmployeeName?: string
}

type HistoryPeriod = "day" | "month" | "year"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" })
}

function getLocalDateKey(value: string | Date | null | undefined) {
  if (!value) return ""
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function sessionMatchesPeriod(session: TurnSession, period: HistoryPeriod, refDate: string) {
  const ref = new Date(refDate)
  const opened = new Date(session.opened_at)
  if (period === "day") {
    return session.date === refDate
  }
  if (period === "month") {
    return opened.getFullYear() === ref.getFullYear() && opened.getMonth() === ref.getMonth()
  }
  // year
  return opened.getFullYear() === ref.getFullYear()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InformeCierreTurnoPage() {
  const { sales, returns, repairs, payments, employees, currentUser, expenses } = useStore()
  const { toast } = useToast()

  const isAdmin = currentUser?.role === "admin"
  const isEmployee = !isAdmin

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateKey(new Date()))
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all")
  const [selectedEmployeeForInvoices, setSelectedEmployeeForInvoices] = useState<string>("all")

  // Turn closing dialog
  const [isClosingDialogOpen, setIsClosingDialogOpen] = useState(false)
  const [selectedEmployeeForClosing, setSelectedEmployeeForClosing] = useState<EmployeeSalesSummary | null>(null)
  const [closingNotes, setClosingNotes] = useState("")
  const [isLoadingClosing, setIsLoadingClosing] = useState(false)
  const [isOpeningDialogOpen, setIsOpeningDialogOpen] = useState(false)
  const [openingEmployee, setOpeningEmployee] = useState<{ id: string; name: string } | null>(null)
  const [openingCash, setOpeningCash] = useState("")
  const [isLoadingOpening, setIsLoadingOpening] = useState(false)

  // Invoices dialog
  const [isInvoicesDialogOpen, setIsInvoicesDialogOpen] = useState(false)
  const [selectedEmployeeInvoices, setSelectedEmployeeInvoices] = useState<Sale[]>([])
  const [selectedEmployeeNameForInvoices, setSelectedEmployeeNameForInvoices] = useState("")

  // Turn sessions
  const [allSessions, setAllSessions] = useState<TurnSession[]>([])
  const [almacenDebtPayments, setAlmacenDebtPayments] = useState<ReportDebtPayment[]>([])
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("day")
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  // ── Load sessions ────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    if (!currentUser) return
    setIsLoadingSessions(true)
    try {
      const supabase = createClient()
      let query = supabase
        .from("turn_sessions")
        .select("*")
        .order("opened_at", { ascending: false })

      // Tenant isolation
      query = query.eq("owner_admin_id", currentUser.adminId)

      // Employees only see their own sessions
      if (isEmployee) {
        query = query.eq("employee_id", currentUser.id)
      }

      const { data, error } = await query
      if (error) {
        console.error("Error loading turn sessions:", error)
        return
      }
      setAllSessions((data as TurnSession[]) || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingSessions(false)
    }
  }, [currentUser, isEmployee])

  const loadAlmacenDebtPayments = useCallback(async () => {
    if (!currentUser) {
      setAlmacenDebtPayments([])
      return
    }

    const { data, error } = await createClient()
      .from("almacen_payments")
      .select("amount, date, payment_method, created_by")
      .eq("owner_admin_id", currentUser.adminId)
      .order("date", { ascending: false })

    if (error) {
      console.error("Error loading almacen debt payments:", error)
      return
    }

    setAlmacenDebtPayments(
      (data || []).map((payment) => ({
        amount: Number(payment.amount) || 0,
        date: String(payment.date),
        paymentMethod: normalizePaymentMethod(payment.payment_method),
        createdByEmployeeId: payment.created_by ? String(payment.created_by) : undefined,
        createdByEmployeeName: payment.created_by_name ? String(payment.created_by_name) : undefined,
      })),
    )
  }, [currentUser])

  useEffect(() => {
    void loadAlmacenDebtPayments()
  }, [loadAlmacenDebtPayments])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Auto-open turn for employee ──────────────────────────────────────────

  /* useEffect(() => {
    if (!currentUser) return

    const autoOpenTurn = () => {
      const today = new Date().toISOString().split("T")[0]
      // Check if already has an open session today
      const openSession = allSessions.find(
        (s) => s.employee_id === currentUser.id && s.date === today && s.status === "open"
      )
      if (openSession?.opening_cash_confirmed) return

      // A closed session must remain closed. The employee can explicitly
      // open a new session when returning from a break.
      const closedToday = allSessions.some(
        (s) => s.employee_id === currentUser.id && s.date === today && s.status === "closed"
      )
      if (closedToday && !openSession) return
      if (openingPromptedFor === currentUser.id) return

      // Find employee record for name
      const emp = employees.find((e) => e.id === currentUser.id) || {
        id: currentUser.id,
        name: currentUser.name,
      }

      setOpeningEmployee({ id: emp.id, name: emp.name })
      setOpeningCash("")
      setOpeningPromptedFor(currentUser.id)
      setIsOpeningDialogOpen(true)
    }

    // Only auto-open when sessions have loaded
    if (!isLoadingSessions) {
      autoOpenTurn()
    }
  }, [currentUser, allSessions, employees, isLoadingSessions, openingPromptedFor]) */

  // ── Realtime refresh ─────────────────────────────────────────────────────

  useRealtimeTableRefresh(["sales", "payments", "turn_sessions", "almacen_payments", "expenses", "returns", "repairs"], () => {
    loadSessions()
    void loadAlmacenDebtPayments()
  }, { ownerAdminId: currentUser?.adminId })

  // ── Sales summary per employee ───────────────────────────────────────────

  const employeeSalesSummary = useMemo(() => {
    const debtPayments: ReportDebtPayment[] = [
      ...payments,
      ...almacenDebtPayments,
    ]
    const filteredSales = sales.filter((sale) => {
      return getLocalDateKey(sale.date) === selectedDate && sale.status !== "anulada"
    })

    const filteredExpenses = expenses.filter((expense) => {
      return getLocalDateKey(expense.date) === selectedDate
    })
    const filteredReturns = returns.filter((returnRecord) => {
      return getLocalDateKey(returnRecord.date) === selectedDate
    })
    const filteredRepairs = repairs.filter((repair) => {
      const isDateMatch = getLocalDateKey(repair.date) === selectedDate
      const isNotCancelled = repair.status !== "cancelado" && repair.status !== "anulado" && repair.status !== "cancelada"
      return isDateMatch && isNotCancelled
    })

    const summaryMap = new Map<string, EmployeeSalesSummary>()

    // Build employee list: admins see all users with a turn (including administrators),
    // employees see only their own summary.
    const employeesFilter = isAdmin
      ? [
          ...employees.filter((e) => e.role === "employee" || e.role === "admin"),
          ...(currentUser && !employees.some((e) => e.id === currentUser.id)
            ? [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, status: "active" as const }]
            : []),
        ]
      : [
          ...employees.filter((e) => e.id === currentUser?.id),
          ...(currentUser && !employees.some((e) => e.id === currentUser.id)
            ? [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, status: "active" as const }]
            : []),
        ]

    employeesFilter.forEach((employee) => {
      summaryMap.set(employee.id, {
        employeeId: employee.id,
        employeeName: employee.name,
        employeeEmail: "email" in employee ? employee.email : "",
        totalSales: 0,
        cashTotal: 0,
        cardTotal: 0,
        transferTotal: 0,
        creditTotal: 0,
        saleCount: 0,
        isActive: employee.status === "active",
        openingCashConfirmed: false,
        closingCashConfirmed: false,
        debtPaymentTotal: 0,
        cashDebtPaymentTotal: 0,
        cashSalesTotal: 0,
        cashReturnsTotal: 0,
        transferReturnsTotal: 0,
        repairsTotal: 0,
        expenseTotal: 0,
        expectedCash: 0,
      })
    })

    const activeEmployees = employeesFilter.filter((e) => e.status === "active")

    if (employeesFilter.length > 0) {
      employeesFilter.forEach((employee) => {
        // Prefer the currently open session. Once it is closed, use the latest
        // closed session. This allows several sessions for the same employee
        // on the same day (for example, 08:00-12:00 and 14:00-18:00).
        const employeeSessions = allSessions
          .filter((session) => session.employee_id === employee.id && session.date === selectedDate)
          .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        const session = employeeSessions.find((item) => item.status === "open") || employeeSessions[0]

        const sessionSales = filteredSales.filter((sale) => {
          const targetId = sale.createdByEmployeeId ?? null
          if (targetId !== employee.id) return false
          return true
        })

        sessionSales.forEach((sale) => {
          const targetId = sale.createdByEmployeeId ?? null
          const summary = targetId ? summaryMap.get(targetId) : null
          if (!summary) return

          const total = Math.max(0, Number(sale.total) || 0)
          const paid = Math.min(total, Math.max(0, Number(sale.amountPaid) || 0))
          const method = normalizePaymentMethod(sale.paymentMethod)
          summary.totalSales += total
          summary.saleCount += 1
          summary.lastSaleTime = sale.date

          if (method === "credit" || sale.status === "credito" && paid <= 0) {
            summary.creditTotal += total
          } else if (paid < total) {
            summary[`${method}Total` as "cashTotal" | "cardTotal" | "transferTotal"] += paid
            if (method === "cash") summary.cashSalesTotal += paid
            summary.creditTotal += total - paid
          } else {
            summary[`${method}Total` as "cashTotal" | "cardTotal" | "transferTotal"] += total
            if (method === "cash") summary.cashSalesTotal += total
          }
        })

        debtPayments
          .filter((payment) => {
            const paymentDate = getLocalDateKey(payment.date)
            const targetId = payment.createdByEmployeeId ?? null
            const sameEmployeeId = targetId === employee.id
            const sameEmployeeName =
              !targetId &&
              Boolean(
                payment.createdByEmployeeName &&
                  payment.createdByEmployeeName.trim().toLowerCase() === employee.name.trim().toLowerCase(),
              )
            return paymentDate === selectedDate && (sameEmployeeId || sameEmployeeName)
          })
          .forEach((payment) => {
            const summary = summaryMap.get(employee.id)
            if (!summary) return
            const amount = Math.max(0, Number(payment.amount) || 0)
            summary.totalSales += amount
            summary.debtPaymentTotal += amount
            if (payment.paymentMethod === "card") summary.cardTotal += amount
            else if (payment.paymentMethod === "transfer") summary.transferTotal += amount
            else {
              summary.cashTotal += amount
              summary.cashDebtPaymentTotal += amount
            }
          })

        filteredReturns
          .filter((returnRecord) => {
            const sameEmployeeId = returnRecord.createdByEmployeeId === employee.id
            const sameEmployeeName =
              !sameEmployeeId &&
              Boolean(
                returnRecord.createdByEmployeeName &&
                  returnRecord.createdByEmployeeName.trim().toLowerCase() === employee.name.trim().toLowerCase(),
              )

            if (sameEmployeeId || sameEmployeeName) return true

            const sale = sales.find((saleEntry) => saleEntry.id === returnRecord.invoiceId)
            const sameSaleEmployeeId = sale?.createdByEmployeeId === employee.id
            const sameSaleEmployeeName =
              !sameSaleEmployeeId &&
              Boolean(
                sale?.createdByEmployeeName &&
                  sale.createdByEmployeeName.trim().toLowerCase() === employee.name.trim().toLowerCase(),
              )

            return sameSaleEmployeeId || sameSaleEmployeeName
          })
          .forEach((returnRecord) => {
            const summary = summaryMap.get(employee.id)
            if (!summary) return
            const amount = Math.max(0, Number(returnRecord.total) || 0)
            if (returnRecord.type === "transferencia") summary.transferReturnsTotal += amount
            else summary.cashReturnsTotal += amount
          })

        filteredRepairs
          .filter((repair) => {
            const sameTechnician =
              Boolean(repair.technician) &&
              (repair.technician === employee.id ||
                repair.technician.trim().toLowerCase() === employee.name.trim().toLowerCase())

            const repairExt = repair as unknown as { createdByEmployeeId?: string; createdByEmployeeName?: string; total?: number }
            const sameCreatorId = repairExt.createdByEmployeeId === employee.id
            const sameCreatorName =
              !repairExt.createdByEmployeeId &&
              Boolean(
                repairExt.createdByEmployeeName &&
                  repairExt.createdByEmployeeName.trim().toLowerCase() === employee.name.trim().toLowerCase(),
              )

            if (sameTechnician || sameCreatorId || sameCreatorName) return true

            const isUnassigned = !repair.technician && !repairExt.createdByEmployeeId && !repairExt.createdByEmployeeName
            if (isUnassigned && employee.id === currentUser?.id) return true

            return false
          })
          .forEach((repair) => {
            const summary = summaryMap.get(employee.id)
            if (!summary) return
            const amount = Math.max(0, Number(repair.cost) || Number((repair as any).total) || 0)
            summary.repairsTotal += amount
          })

        filteredExpenses
          .filter((expense) => {
            const sameUserId = expense.userId === employee.id
            const sameUserName =
              !sameUserId &&
              Boolean(
                expense.userName &&
                  expense.userName.trim().toLowerCase() === employee.name.trim().toLowerCase(),
              )
            return sameUserId || sameUserName
          })
          .forEach((expense) => {
            const summary = summaryMap.get(employee.id)
            if (!summary) return
            const amount = Math.max(0, Number(expense.amount) || 0)
            summary.expenseTotal += amount
          })

        const summary = summaryMap.get(employee.id)
        if (summary && session) {
          summary.sessionId = session.id
          summary.sessionOpenedAt = session.opened_at
          summary.sessionClosedAt = session.closed_at
          summary.sessionStatus = session.status
          summary.openingCash = Number(session.opening_cash) || 0
          summary.openingCashConfirmed = session.opening_cash_confirmed === true
          summary.closingCash = session.closing_cash
          summary.closingCashConfirmed = session.status === "closed" && session.closing_cash !== null
          summary.expectedCash =
            summary.openingCash +
            summary.cashSalesTotal +
            summary.cashDebtPaymentTotal +
            summary.repairsTotal -
            summary.cashReturnsTotal -
            summary.expenseTotal
        }
      })
    }

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return b.totalSales - a.totalSales
    })
  }, [sales, returns, repairs, payments, almacenDebtPayments, expenses, selectedDate, employees, isAdmin, isEmployee, currentUser, allSessions])

  const filteredSummary = useMemo(() => {
    if (selectedEmployee === "all") return employeeSalesSummary
    return employeeSalesSummary.filter((s) => s.employeeId === selectedEmployee)
  }, [employeeSalesSummary, selectedEmployee])

  const employeeFilterOptions = useMemo(() => {
    return employees
      .filter((employee) => employee.role === "employee" || employee.role === "admin")
      .map((employee) => ({ id: employee.id, name: employee.name }))
  }, [employees])

  const totals = useMemo(() => ({
    totalSales: filteredSummary.reduce((s, e) => s + e.totalSales, 0),
    totalDebtPayments: filteredSummary.reduce((s, e) => s + e.debtPaymentTotal, 0),
    totalCash: filteredSummary.reduce((s, e) => s + e.cashTotal, 0),
    totalCard: filteredSummary.reduce((s, e) => s + e.cardTotal, 0),
    totalTransfer: filteredSummary.reduce((s, e) => s + e.transferTotal, 0),
    totalCredit: filteredSummary.reduce((s, e) => s + e.creditTotal, 0),
    totalExpenses: filteredSummary.reduce((s, e) => s + e.expenseTotal, 0),
    totalSaleCount: filteredSummary.reduce((s, e) => s + e.saleCount, 0),
  }), [filteredSummary])

  const dailyExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const isDateMatch = getLocalDateKey(expense.date) === selectedDate
      if (!isDateMatch) return false
      if (selectedEmployee !== "all") {
        const emp = employees.find((e) => e.id === selectedEmployee)
        const sameUserId = expense.userId === selectedEmployee
        const sameUserName =
          !sameUserId &&
          Boolean(
            emp &&
              expense.userName &&
              expense.userName.trim().toLowerCase() === emp.name.trim().toLowerCase(),
          )
        return sameUserId || sameUserName
      }
      if (isEmployee) {
        const sameUserId = expense.userId === currentUser?.id
        const sameUserName =
          !sameUserId &&
          Boolean(
            currentUser?.name &&
              expense.userName &&
              expense.userName.trim().toLowerCase() === currentUser.name.trim().toLowerCase(),
          )
        return sameUserId || sameUserName
      }
      return true
    })
  }, [expenses, selectedDate, selectedEmployee, employees, isEmployee, currentUser])

  const chartData = useMemo(() => filteredSummary.map((e) => ({
    name: e.employeeName.split(" ")[0],
    Efectivo: e.cashTotal,
    Tarjeta: e.cardTotal,
    Transferencia: e.transferTotal,
    Crédito: e.creditTotal,
    Total: e.totalSales,
  })), [filteredSummary])

  // ── History filtered by period ────────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    return allSessions.filter((s) => sessionMatchesPeriod(s, historyPeriod, selectedDate))
  }, [allSessions, historyPeriod, selectedDate])

  // ── Session helpers ───────────────────────────────────────────────────────

  const getOpenSessionForEmployee = useCallback((employeeId: string) => {
    const today = new Date().toISOString().split("T")[0]
    return allSessions.find((s) => s.employee_id === employeeId && s.date === today && s.status === "open") || null
  }, [allSessions])

  const getTodaySessionForEmployee = useCallback((employeeId: string) => {
    const today = new Date().toISOString().split("T")[0]
    const sessions = allSessions
      .filter((s) => s.employee_id === employeeId && s.date === today)
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    return sessions.find((s) => s.status === "open") || sessions[0] || null
  }, [allSessions])

  const hasClosedTodayForEmployee = useCallback((employeeId: string) => {
    const today = new Date().toISOString().split("T")[0]
    return allSessions.some((s) => s.employee_id === employeeId && s.date === today && s.status === "closed")
  }, [allSessions])

  // ── Invoices handler ──────────────────────────────────────────────────────

  const handleViewInvoices = (employeeId: string, employeeName: string) => {
    const employeeSales = sales.filter((sale) => {
      const saleDate = new Date(sale.date).toISOString().split("T")[0]
      const targetId = sale.createdByEmployeeId ?? null
      return saleDate === selectedDate && sale.status !== "anulada" && targetId === employeeId
    })
    setSelectedEmployeeInvoices(employeeSales)
    setSelectedEmployeeNameForInvoices(employeeName)
    setSelectedEmployeeForInvoices(employeeId)
    setIsInvoicesDialogOpen(true)
  }

  // ── Close turn ────────────────────────────────────────────────────────────

  const handleTurnClosing = useCallback((employee: EmployeeSalesSummary) => {
    setSelectedEmployeeForClosing(employee)
    setClosingNotes("")
    setIsClosingDialogOpen(true)
  }, [])

  const handleOpenTurn = useCallback(() => {
    if (!currentUser) return
    const employee = employees.find((item) => item.id === currentUser.id) || {
      id: currentUser.id,
      name: currentUser.name,
    }
    if (!employee || getTodaySessionForEmployee(currentUser.id)?.status === "open") return

    setOpeningEmployee({ id: employee.id, name: employee.name })
    setOpeningCash("")
    setIsOpeningDialogOpen(true)
  }, [currentUser, employees, getTodaySessionForEmployee])

  const confirmTurnOpening = useCallback(async () => {
    if (!currentUser || !openingEmployee) return
    const amount = Number(openingCash)
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "Monto inválido", description: "Indica un efectivo inicial igual o mayor que cero.", variant: "destructive" })
      return
    }

    setIsLoadingOpening(true)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split("T")[0]
      const existingOpenSession = allSessions.find(
        (session) => session.employee_id === openingEmployee.id && session.date === today && session.status === "open",
      )
      const result = existingOpenSession
        ? await supabase
            .from("turn_sessions")
            .update({ opening_cash: amount, opening_cash_confirmed: true })
            .eq("id", existingOpenSession.id)
        : await supabase.from("turn_sessions").insert({
            owner_admin_id: currentUser.adminId,
            employee_id: openingEmployee.id,
            employee_name: openingEmployee.name,
            date: today,
            opened_at: new Date().toISOString(),
            status: "open",
            opening_cash: amount,
            opening_cash_confirmed: true,
          })
      const { error } = result
      if (error) throw error
      toast({ title: "Turno abierto", description: `Efectivo inicial: ${formatCurrency(amount)}` })
      setIsOpeningDialogOpen(false)
      setOpeningEmployee(null)
      await loadSessions()
    } catch (error) {
      console.error("Error opening turn:", error)
      toast({ title: "Error", description: "No se pudo abrir el nuevo turno", variant: "destructive" })
    } finally {
      setIsLoadingOpening(false)
    }
  }, [currentUser, openingEmployee, openingCash, allSessions, toast, loadSessions])

  const confirmTurnClosing = useCallback(async () => {
    if (!selectedEmployeeForClosing || !currentUser) return
    const amountInvoiced = Math.max(0, Number(selectedEmployeeForClosing.totalSales) || 0)
    setIsLoadingClosing(true)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split("T")[0]

      // Find the open session for this employee today
      const openSession = allSessions.find(
        (s) => s.employee_id === selectedEmployeeForClosing.employeeId && s.date === today && s.status === "open"
      )

      if (openSession) {
        // Update the existing session record
        const { error } = await supabase
          .from("turn_sessions")
          .update({
            closed_at: new Date().toISOString(),
            status: "closed",
            closing_cash: amountInvoiced,
            cash_total: selectedEmployeeForClosing.cashTotal,
            card_total: selectedEmployeeForClosing.cardTotal,
            transfer_total: selectedEmployeeForClosing.transferTotal,
            credit_total: selectedEmployeeForClosing.creditTotal,
            total_sales: amountInvoiced,
            sale_count: Math.round(selectedEmployeeForClosing.saleCount),
            notes: closingNotes || null,
          })
          .eq("id", openSession.id)

        if (error) throw error
      } else {
        // No open session found — create a closed one directly (admin-initiated)
        const emp = employees.find((e) => e.id === selectedEmployeeForClosing.employeeId)
        const { error } = await supabase.from("turn_sessions").insert({
          owner_admin_id: currentUser.adminId,
          employee_id: selectedEmployeeForClosing.employeeId,
          employee_name: selectedEmployeeForClosing.employeeName,
          date: today,
          opened_at: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          closed_at: new Date().toISOString(),
          status: "closed",
          opening_cash: 0,
          opening_cash_confirmed: true,
          closing_cash: amountInvoiced,
          cash_total: selectedEmployeeForClosing.cashTotal,
          card_total: selectedEmployeeForClosing.cardTotal,
          transfer_total: selectedEmployeeForClosing.transferTotal,
          credit_total: selectedEmployeeForClosing.creditTotal,
          total_sales: amountInvoiced,
          sale_count: Math.round(selectedEmployeeForClosing.saleCount),
          notes: closingNotes || null,
        })
        if (error) throw error
      }

      toast({
        title: "Turno marcado como cerrado",
        description: `Se registró el cierre de ${selectedEmployeeForClosing.employeeName} a las ${new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}.`,
      })

      setIsClosingDialogOpen(false)
      setSelectedEmployeeForClosing(null)
      await loadSessions()
    } catch (error: unknown) {
      console.error("Error closing turn:", error)
      toast({
        title: "Error",
        description: "No se pudo registrar el cierre de turno",
        variant: "destructive",
      })
    } finally {
      setIsLoadingClosing(false)
    }
  }, [selectedEmployeeForClosing, currentUser, allSessions, employees, closingNotes, toast, loadSessions])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Informe de Cierre de Turno</h1>
          <p className="text-muted-foreground mt-2">
            Control de ventas y turnos por empleado
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadSessions() }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date-filter">Fecha</Label>
              <Input
                id="date-filter"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="employee-filter">Empleado</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger id="employee-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los empleados</SelectItem>
                    {employeeFilterOptions.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}{employee.id === currentUser?.id ? " (Administrador)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total General", icon: <DollarSign className="h-4 w-4 text-green-600" />, value: totals.totalSales, sub: `${Math.round(totals.totalSaleCount)} ventas · ${formatCurrency(totals.totalDebtPayments)} en abonos` },
          { label: "Efectivo", icon: <Banknote className="h-4 w-4 text-emerald-600" />, value: totals.totalCash, sub: `${totals.totalSales > 0 ? ((totals.totalCash / totals.totalSales) * 100).toFixed(1) : "0.0"}%` },
          { label: "Tarjeta", icon: <CreditCard className="h-4 w-4 text-blue-600" />, value: totals.totalCard, sub: `${totals.totalSales > 0 ? ((totals.totalCard / totals.totalSales) * 100).toFixed(1) : "0.0"}%` },
          { label: "Transferencia", icon: <ArrowRightLeft className="h-4 w-4 text-purple-600" />, value: totals.totalTransfer, sub: `${totals.totalSales > 0 ? ((totals.totalTransfer / totals.totalSales) * 100).toFixed(1) : "0.0"}%` },
          { label: "Crédito", icon: <AlertCircle className="h-4 w-4 text-orange-600" />, value: totals.totalCredit, sub: "Por cobrar" },
          { label: "Abonos de deuda", icon: <CheckCircle2 className="h-4 w-4 text-amber-600" />, value: totals.totalDebtPayments, sub: "Pagos recibidos" },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {card.icon}
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(card.value)}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Gastos del Día
          </CardTitle>
          <CardDescription>
            Total: {formatCurrency(totals.totalExpenses)} · {dailyExpenses.length} gastos registrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dailyExpenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay gastos registrados para esta fecha.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Registrado por</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Categoría</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell className="font-medium">{expense.userName || "Sistema"}</TableCell>
                      <TableCell className="capitalize">{expense.paymentMethod}</TableCell>
                      <TableCell className="text-right font-medium text-red-600">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>{expense.category}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {filteredSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Distribución de Ventas por Método de Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="Efectivo" fill="#22c55e" />
                <Bar dataKey="Tarjeta" fill="#3b82f6" />
                <Bar dataKey="Transferencia" fill="#8b5cf6" />
                <Bar dataKey="Crédito" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Employee summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Resumen por Empleado
          </CardTitle>
          <CardDescription>
            Estado de ventas y turno — {selectedDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSummary.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ventas registradas para el {selectedDate}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="text-center">Aceptación</TableHead>
                    <TableHead className="text-right">Caja inicial</TableHead>
                    <TableHead className="text-right">Monto facturado</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Tarjeta</TableHead>
                    <TableHead className="text-right">Transferencia</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Abonos deuda</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Reparaciones</TableHead>
                    <TableHead className="text-right">Dev. efectivo</TableHead>
                    <TableHead className="text-right">Dev. transferencia</TableHead>
                    <TableHead className="text-right">Esperado en caja</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Turno</TableHead>
                    <TableHead className="text-center">Apertura</TableHead>
                    <TableHead className="text-center">Cierre</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummary.map((employee) => {
                    const selectedSession = employee.sessionId
                      ? allSessions.find((session) => session.id === employee.sessionId) || null
                      : null
                    const openSession = selectedSession?.status === "open" ? selectedSession : null
                    const isClosed = selectedSession?.status === "closed"
                    const isToday = selectedDate === new Date().toISOString().split("T")[0]
                    // Employees can close their own turn; administrators can close any employee's open turn.
                    const canClose = isToday && !!openSession && (isAdmin || (isEmployee && currentUser?.id === employee.employeeId))

                    return (
                      <TableRow key={employee.employeeId}>
                        <TableCell className="font-medium">
                          <div>{employee.employeeName}</div>
                          <div className="text-xs font-normal text-muted-foreground">{employee.employeeEmail || "Correo no disponible"}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          {employee.openingCashConfirmed ? (
                            employee.closingCashConfirmed ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">Apertura y cierre realizados</Badge>
                            ) : (
                              <Badge variant="outline" className="border-blue-400 text-blue-700">Apertura realizada</Badge>
                            )
                          ) : (
                            <Badge variant="destructive">Pendiente de apertura</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-blue-600 font-medium">
                          {employee.openingCashConfirmed ? formatCurrency(employee.openingCash || 0) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCurrency(employee.totalSales)}
                        </TableCell>
                        <TableCell className="text-right text-sm">{Math.round(employee.saleCount)}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-600 font-medium">{formatCurrency(employee.cashSalesTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-blue-600 font-medium">{formatCurrency(employee.cardTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-purple-600 font-medium">{formatCurrency(employee.transferTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-orange-600 font-medium">{formatCurrency(employee.creditTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-amber-600 font-medium">{formatCurrency(employee.debtPaymentTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-red-600 font-medium">{formatCurrency(employee.expenseTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-purple-600 font-medium">{formatCurrency(employee.repairsTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-red-600 font-medium">{formatCurrency(employee.cashReturnsTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-orange-600 font-medium">{formatCurrency(employee.transferReturnsTotal)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-lg font-bold text-green-700">{formatCurrency(employee.expectedCash)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-lg font-bold">{formatCurrency(employee.totalSales)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isClosed ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Cerrado
                            </Badge>
                          ) : openSession ? (
                            <Badge variant="outline" className="border-blue-400 text-blue-700">
                              <LogIn className="h-3 w-3 mr-1" />
                              Abierto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Sin turno
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {selectedSession ? formatTime(selectedSession.opened_at) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {selectedSession?.closed_at ? formatTime(selectedSession.closed_at) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewInvoices(employee.employeeId, employee.employeeName)}
                            >
                              Ver Facturas
                            </Button>
                            {canClose && (
                              <Button
                                size="sm"
                                onClick={() => handleTurnClosing(employee)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                <LogOut className="h-4 w-4 mr-1" />
                                Registrar y cerrar turno
                              </Button>
                            )}
                            {isClosed && (
                              currentUser?.id === employee.employeeId ? (
                                <Button variant="outline" size="sm" onClick={handleOpenTurn}>
                                  <LogIn className="h-4 w-4 mr-1" /> Abrir nuevo turno
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Cerrado
                                </span>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Turn history */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historial de Turnos
              </CardTitle>
              <CardDescription>
                Registro de aperturas y cierres de turno
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={historyPeriod} onValueChange={(v) => setHistoryPeriod(v as HistoryPeriod)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Este día</SelectItem>
                  <SelectItem value="month">Este mes</SelectItem>
                  <SelectItem value="year">Este año</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSessions ? (
            <div className="text-center py-8 text-muted-foreground">Cargando historial...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de turnos para el período seleccionado.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-center">Apertura</TableHead>
                    <TableHead className="text-center">Cierre</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.employee_name}</TableCell>
                      <TableCell className="text-sm">{formatDate(session.opened_at)}</TableCell>
                      <TableCell className="text-center text-sm">
                        <span className="flex items-center justify-center gap-1 text-blue-600">
                          <LogIn className="h-3 w-3" />
                          {formatTime(session.opened_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {session.closed_at ? (
                          <span className="flex items-center justify-center gap-1 text-red-600">
                            <LogOut className="h-3 w-3" />
                            {formatTime(session.closed_at)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {session.status === "open" ? (
                          <Badge variant="outline" className="border-blue-400 text-blue-700">Abierto</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">Cerrado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{session.sale_count}</TableCell>
                      <TableCell className="text-right text-blue-600 font-medium">
                        {formatCurrency(session.opening_cash)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {session.closing_cash === null ? "—" : formatCurrency(session.closing_cash)}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {formatCurrency(session.cash_total)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(session.total_sales)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {session.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Opening dialog */}
      <Dialog open={isOpeningDialogOpen} onOpenChange={setIsOpeningDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Abrir turno</DialogTitle>
            <DialogDescription>
              Confirma cuánto efectivo hay en caja al inicio del turno de {openingEmployee?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="opening-cash">Efectivo inicial en caja</Label>
            <Input
              id="opening-cash"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={openingCash}
              onChange={(event) => setOpeningCash(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpeningDialogOpen(false)} disabled={isLoadingOpening}>
              Cancelar
            </Button>
            <Button onClick={confirmTurnOpening} disabled={isLoadingOpening}>
              {isLoadingOpening ? "Guardando..." : "Confirmar apertura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closing dialog */}
      <Dialog open={isClosingDialogOpen} onOpenChange={setIsClosingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar facturación del día</DialogTitle>
            <DialogDescription>
              Indica el monto facturado por {selectedEmployeeForClosing?.employeeName} y cierra el registro del turno.
            </DialogDescription>
          </DialogHeader>

          {selectedEmployeeForClosing && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border p-3 bg-green-50">
                  <div className="text-xs text-muted-foreground">Ventas en efectivo</div>
                  <div className="font-bold text-green-700">{formatCurrency(selectedEmployeeForClosing.cashSalesTotal)}</div>
                </div>
                <div className="rounded-lg border p-3 bg-blue-50">
                  <div className="text-xs text-muted-foreground">Pagos de deuda (efectivo)</div>
                  <div className="font-bold text-blue-700">{formatCurrency(selectedEmployeeForClosing.cashDebtPaymentTotal)}</div>
                </div>
                <div className="rounded-lg border p-3 bg-purple-50">
                  <div className="text-xs text-muted-foreground">Reparaciones</div>
                  <div className="font-bold text-purple-700">{formatCurrency(selectedEmployeeForClosing.repairsTotal)}</div>
                </div>
                <div className="rounded-lg border p-3 bg-orange-50">
                  <div className="text-xs text-muted-foreground">Devoluciones en efectivo</div>
                  <div className="font-bold text-orange-700">-{formatCurrency(selectedEmployeeForClosing.cashReturnsTotal)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border p-3 bg-orange-50">
                  <div className="text-xs text-muted-foreground">Devoluciones en transferencia</div>
                  <div className="font-bold text-orange-700">-{formatCurrency(selectedEmployeeForClosing.transferReturnsTotal)}</div>
                </div>
                <div className="rounded-lg border p-3 bg-amber-50">
                  <div className="text-xs text-muted-foreground">Gastos</div>
                  <div className="font-bold text-amber-700">-{formatCurrency(selectedEmployeeForClosing.expenseTotal)}</div>
                </div>
              </div>
              <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4">
                <div className="text-sm font-medium text-green-800">TOTAL ESPERADO EN CAJA</div>
                <div className="text-2xl font-bold text-green-700">{formatCurrency(selectedEmployeeForClosing.expectedCash)}</div>
                <div className="mt-1 text-xs text-muted-foreground">Incluye efectivo inicial y movimientos que afectan la caja.</div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="closing-notes">Notas (opcional)</Label>
                <Textarea
                  id="closing-notes"
                  placeholder="Agregar cualquier observación sobre el cierre de turno..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsClosingDialogOpen(false)}
              disabled={isLoadingClosing}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmTurnClosing}
              disabled={isLoadingClosing}
              className="bg-destructive text-destructive-foreground"
            >
              {isLoadingClosing ? "Procesando..." : "Marcar turno como cerrado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoices dialog */}
      <Dialog open={isInvoicesDialogOpen} onOpenChange={setIsInvoicesDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Facturas de {selectedEmployeeNameForInvoices}</DialogTitle>
            <DialogDescription>
              Ventas generadas en el turno ({selectedDate})
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4">
            {selectedEmployeeInvoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No hay facturas para mostrar.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura #</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedEmployeeInvoices.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.invoiceNumber}</TableCell>
                      <TableCell>{sale.customerName || "Cliente General"}</TableCell>
                      <TableCell className="capitalize">{sale.paymentMethod}</TableCell>
                      <TableCell className="text-right">{formatCurrency(sale.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setIsInvoicesDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
