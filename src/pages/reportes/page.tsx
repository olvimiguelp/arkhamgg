"use client"

import { useMemo, useState } from "react"
import { useStore } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"
import { isAlmacenSourceRecord, normalizeInventorySourceTable, sameSaleItemSource } from "@/lib/transaction-classification"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Printer,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  FileSpreadsheet,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ReportsPage() {
  // Include expenses for net profit calculation
  const { sales, repairs, products, returns, expenses, payments, paymentAllocations, customers } = useStore()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [reportType, setReportType] = useState("monthly")
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().getMonth().toString())
  const [selectedDateYear, setSelectedDateYear] = useState(new Date().getFullYear().toString())
  const [selectedDateMonth, setSelectedDateMonth] = useState((new Date().getMonth() + 1).toString())
  const [selectedDateDay, setSelectedDateDay] = useState(new Date().getDate().toString())
  const [chartType, setChartType] = useState<"bar" | "line" | "area">("bar")
  const [showOnlyAlmacen, setShowOnlyAlmacen] = useState(false)

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const startYear = 2023
    const list = []
    for (let y = currentYear + 1; y >= startYear; y--) {
      list.push(String(y))
    }
    return list
  }, [])

  const daysInSelectedMonth = useMemo(() => {
    const year = Number.parseInt(selectedDateYear, 10)
    const month = Number.parseInt(selectedDateMonth, 10)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return 31
    return new Date(year, month, 0).getDate()
  }, [selectedDateYear, selectedDateMonth])

  const selectedDate = useMemo(() => {
    const year = Number.parseInt(selectedDateYear, 10)
    const month = Number.parseInt(selectedDateMonth, 10)
    const day = Math.min(Number.parseInt(selectedDateDay, 10) || 1, daysInSelectedMonth)
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return new Date().toISOString().split("T")[0]
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }, [daysInSelectedMonth, selectedDateDay, selectedDateMonth, selectedDateYear])

  const almacenProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => {
            const explicitSource = normalizeInventorySourceTable(product.sourceTable)
            if (explicitSource) return explicitSource === "armacen"
            return Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category))
          })
          .map((product) => product.id),
      ),
    [products],
  )

  const reportData = useMemo(() => {
    type ReportSaleRow = {
      sale: (typeof sales)[number]
      items: (typeof sales)[number]["items"]
      total: number
      cost: number
    }
    type ReportReturnRow = {
      returnRecord: (typeof returns)[number]
      sale: (typeof sales)[number] | undefined
      items: (typeof returns)[number]["items"]
      total: number
      costReversal: number
    }

    const isAlmacenSaleItem = (item: (typeof sales)[number]["items"][number]) =>
      isAlmacenSourceRecord(item as Record<string, unknown>, almacenProductIds)

    const resolveSaleItems = (sale: (typeof sales)[number]) =>
      showOnlyAlmacen ? sale.items.filter((item) => isAlmacenSaleItem(item)) : sale.items

    const resolveSalePaidAmount = (sale: (typeof sales)[number]) => {
      const total = Math.max(0, Number(sale.total) || 0)
      const allocatedAfterSaleAmount = paymentAllocations
        .filter((allocation) => allocation.saleId === sale.id)
        .reduce((sum, allocation) => sum + Math.max(0, Number(allocation.appliedAmount) || 0), 0)
      // `amountPaid` contiene también los abonos posteriores de una venta a
      // crédito. Esos abonos se reportan por separado usando payments.date.
      const amountPaid = Math.min(
        total,
        Math.max(0, Number(sale.amountPaid) || 0) - allocatedAfterSaleAmount,
      )
      const isCreditSale = sale.status === "credito" || sale.paymentMethod === "credit"

      // En crédito se muestra solo lo abonado. Las ventas antiguas de contado
      // pueden no tener amountPaid guardado, por lo que usamos su total.
      return isCreditSale || amountPaid > 0 ? amountPaid : total
    }

    const resolveSaleTotal = (sale: (typeof sales)[number], items: (typeof sales)[number]["items"]) => {
      const itemsTotal = items.reduce((acc, item) => acc + (item.customPrice ?? item.sellPrice) * item.quantity, 0)
      const saleTotal = Math.max(0, Number(sale.total) || 0)
      const isNewCostAccountingSale = sale.items.some((item) => item.accountingVersion === 2)
      if (showOnlyAlmacen) {
        const paidRatio = saleTotal > 0 ? resolveSalePaidAmount(sale) / saleTotal : 0
        return itemsTotal * paidRatio
      }

      // Solo contabiliza en el reporte la porción realmente cobrada de la venta.
      // Así, una venta a crédito sin abono no impacta los ingresos ni los gastos del sistema.
      return resolveSalePaidAmount(sale) || (!isNewCostAccountingSale && itemsTotal > 0 && sale.status !== "credito" ? itemsTotal : 0)
    }

    const resolveSaleCost = (sale: (typeof sales)[number], items: (typeof sales)[number]["items"]) => {
      const totalCost = items.reduce((acc, item) => acc + item.buyPrice * item.quantity, 0)
      const saleTotal = Math.max(0, Number(sale.total) || 0)
      const paidRatio = saleTotal > 0 ? resolveSalePaidAmount(sale) / saleTotal : 0
      if (!showOnlyAlmacen) return totalCost * paidRatio

      const saleCost = sale.items.reduce((acc, item) => acc + item.buyPrice * item.quantity, 0)
      return saleCost > 0 ? totalCost * paidRatio : 0
    }

    const resolveReturnItems = (returnRecord: (typeof returns)[number]) =>
      showOnlyAlmacen ? returnRecord.items.filter((item) => isAlmacenSourceRecord(item as Record<string, unknown>, almacenProductIds)) : returnRecord.items

    const resolveReturnTotal = (returnRecord: (typeof returns)[number], items: (typeof returns)[number]["items"]) =>
      showOnlyAlmacen ? items.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0) : Number(returnRecord.total) || 0

    const resolveReturnCostReversal = (
      returnRecord: (typeof returns)[number],
      sale: (typeof sales)[number] | undefined,
      items: (typeof returns)[number]["items"],
    ) => {
      if (returnRecord.returnToInventory === false || !sale) return 0

      return items.reduce((acc, returnItem) => {
        const matchingSaleItem = sale.items.find((saleItem) => {
          if (sameSaleItemSource(returnItem, saleItem)) return true
          if (returnItem.sourceTable && saleItem.sourceTable && returnItem.sourceTable !== saleItem.sourceTable) return false
          if (returnItem.sourceId && saleItem.sourceId && returnItem.sourceId !== saleItem.sourceId) return false
          if (returnItem.productId && saleItem.id && returnItem.productId === saleItem.id) return true
          if (returnItem.imei && saleItem.imei) return returnItem.imei === saleItem.imei
          return saleItem.name === returnItem.productName
        })
        const unitBuyPrice = returnRecord.accountingVersion === 2
          ? Number(returnItem.buyPrice ?? matchingSaleItem?.buyPrice ?? 0)
          : Number(matchingSaleItem?.buyPrice ?? 0)
        return acc + unitBuyPrice * returnItem.quantity
      }, 0)
    }

    const buildSalesRows = (baseSales: typeof sales): ReportSaleRow[] =>
      baseSales
        .map((sale) => {
          const items = resolveSaleItems(sale)
          return {
            sale,
            items,
            total: resolveSaleTotal(sale, items),
            cost: resolveSaleCost(sale, items),
          }
        })
        .filter((row) => !showOnlyAlmacen || row.items.length > 0)

    const buildReturnRows = (baseReturns: typeof returns): ReportReturnRow[] =>
      baseReturns
        .map((returnRecord) => {
          const sale = sales.find((saleEntry) => saleEntry.id === returnRecord.invoiceId)
          const items = resolveReturnItems(returnRecord)
          return {
            returnRecord,
            sale,
            items,
            total: resolveReturnTotal(returnRecord, items),
            costReversal: resolveReturnCostReversal(returnRecord, sale, items),
          }
        })
        .filter((row) => !showOnlyAlmacen || row.items.length > 0)

    const yearSales = sales.filter(
      (s) => new Date(s.date).getFullYear().toString() === selectedYear && s.status !== "pending",
    )
    const yearReturns = returns.filter((r) => new Date(r.date).getFullYear().toString() === selectedYear)
    const yearRepairs = repairs.filter(
      (r) => new Date(r.date).getFullYear().toString() === selectedYear && r.status === "completed",
    )
    // Expenses for the selected year
    const yearExpenses = expenses.filter((e) => new Date(e.date).getFullYear().toString() === selectedYear)
    const yearDebtPayments = payments.filter(
      (payment) =>
        payment.paymentKind === "debt_payment" &&
        payment.customerType === (showOnlyAlmacen ? "almacen" : "general") &&
        new Date(payment.date).getFullYear().toString() === selectedYear,
    )
    const isSpecialExpense = (expense: (typeof expenses)[number]) => expense.category === "gasto_especial"
    const specialExpenseTotal = yearExpenses
      .filter(isSpecialExpense)
      .reduce((acc, expense) => acc + Number(expense.amount || 0), 0)
    const monthlySpecialExpense = specialExpenseTotal / 12

    let filteredSales: ReportSaleRow[] = []
    let filteredReturns: ReportReturnRow[] = []
    let filteredRepairs: typeof repairs = []
    let filteredDebtPayments: typeof payments = []
    // Expenses filtered according to the selected period
    let filteredExpenses: typeof expenses = []
    const chartData: { name: string; Ingresos: number; Gastos: number; Ganancia: number }[] = []
    const summary = { income: 0, costs: 0, profit: 0, salesCount: 0, repairsCount: 0 }

    if (reportType === "monthly") {
      filteredSales = buildSalesRows(yearSales.filter((s) => new Date(s.date).getMonth().toString() === selectedPeriod))
      filteredReturns = buildReturnRows(yearReturns.filter((r) => new Date(r.date).getMonth().toString() === selectedPeriod))
      filteredRepairs = showOnlyAlmacen
        ? []
        : yearRepairs.filter((r) => new Date(r.date).getMonth().toString() === selectedPeriod)
      filteredDebtPayments = yearDebtPayments.filter((payment) => new Date(payment.date).getMonth().toString() === selectedPeriod)

      // Filter expenses by month for monthly report
      filteredExpenses = yearExpenses.filter(
        (e) => !isSpecialExpense(e) && new Date(e.date).getMonth().toString() === selectedPeriod,
      )

      const daysInMonth = new Date(Number.parseInt(selectedYear), Number.parseInt(selectedPeriod) + 1, 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        const daySales = filteredSales.filter(({ sale }) => new Date(sale.date).getDate() === i)
        const dayReturns = filteredReturns.filter(({ returnRecord }) => new Date(returnRecord.date).getDate() === i)
        const dayRepairs = filteredRepairs.filter((r) => new Date(r.date).getDate() === i)
        const dayDebtPayments = filteredDebtPayments.filter((payment) => new Date(payment.date).getDate() === i)

        const dayIncome =
          daySales.reduce((acc, row) => acc + row.total, 0) -
          dayReturns.reduce((acc, row) => acc + row.total, 0) +
          dayRepairs.reduce((acc, r) => acc + Number.parseFloat(r.cost || "0"), 0) +
          dayDebtPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
        const dayCosts =
          daySales.reduce((acc, row) => acc + row.cost, 0) -
          dayReturns.reduce((acc, row) => acc + row.costReversal, 0)

        chartData.push({
          name: `${i}`,
          Ingresos: dayIncome,
          Gastos: dayCosts + monthlySpecialExpense / daysInMonth,
          Ganancia: dayIncome - dayCosts - monthlySpecialExpense / daysInMonth,
        })
      }
    } else if (reportType === "annual") {
      filteredSales = buildSalesRows(yearSales)
      filteredReturns = buildReturnRows(yearReturns)
      filteredRepairs = showOnlyAlmacen ? [] : yearRepairs
      filteredDebtPayments = yearDebtPayments
      // All expenses for the year
      filteredExpenses = yearExpenses.filter((e) => !isSpecialExpense(e))

      for (let i = 0; i < 12; i++) {
        const monthSales = filteredSales.filter(({ sale }) => new Date(sale.date).getMonth() === i)
        const monthReturns = filteredReturns.filter(({ returnRecord }) => new Date(returnRecord.date).getMonth() === i)
        const monthRepairs = filteredRepairs.filter((r) => new Date(r.date).getMonth() === i)
        const monthDebtPayments = filteredDebtPayments.filter((payment) => new Date(payment.date).getMonth() === i)

        const monthIncome =
          monthSales.reduce((acc, row) => acc + row.total, 0) -
          monthReturns.reduce((acc, row) => acc + row.total, 0) +
          monthRepairs.reduce((acc, r) => acc + Number.parseFloat(r.cost || "0"), 0) +
          monthDebtPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
        const monthCosts =
          monthSales.reduce((acc, row) => acc + row.cost, 0) -
          monthReturns.reduce((acc, row) => acc + row.costReversal, 0)

        const monthName = new Date(2024, i, 1).toLocaleString("es-ES", { month: "short" })

        chartData.push({
          name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          Ingresos: monthIncome,
          Gastos: monthCosts + monthlySpecialExpense,
          Ganancia: monthIncome - monthCosts - monthlySpecialExpense,
        })
      }
    } else if (reportType === "quarterly") {
      const quarterStart = Number.parseInt(selectedPeriod) * 3
      const quarterEnd = quarterStart + 3

      filteredSales = buildSalesRows(
        yearSales.filter((s) => {
          const m = new Date(s.date).getMonth()
          return m >= quarterStart && m < quarterEnd
        }),
      )
      filteredReturns = buildReturnRows(
        yearReturns.filter((r) => {
          const m = new Date(r.date).getMonth()
          return m >= quarterStart && m < quarterEnd
        }),
      )
      filteredRepairs = showOnlyAlmacen
        ? []
        : yearRepairs.filter((r) => {
          const m = new Date(r.date).getMonth()
          return m >= quarterStart && m < quarterEnd
        })
      filteredDebtPayments = yearDebtPayments.filter((payment) => {
        const m = new Date(payment.date).getMonth()
        return m >= quarterStart && m < quarterEnd
      })

      // Filter expenses for the same quarter
      filteredExpenses = yearExpenses.filter((e) => {
        const m = new Date(e.date).getMonth()
        return !isSpecialExpense(e) && m >= quarterStart && m < quarterEnd
      })

      for (let i = quarterStart; i < quarterEnd; i++) {
        const monthSales = filteredSales.filter(({ sale }) => new Date(sale.date).getMonth() === i)
        const monthReturns = filteredReturns.filter(({ returnRecord }) => new Date(returnRecord.date).getMonth() === i)
        const monthRepairs = filteredRepairs.filter((r) => new Date(r.date).getMonth() === i)
        const monthDebtPayments = filteredDebtPayments.filter((payment) => new Date(payment.date).getMonth() === i)

        const monthIncome =
          monthSales.reduce((acc, row) => acc + row.total, 0) -
          monthReturns.reduce((acc, row) => acc + row.total, 0) +
          monthRepairs.reduce((acc, r) => acc + Number.parseFloat(r.cost || "0"), 0) +
          monthDebtPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
        const monthCosts =
          monthSales.reduce((acc, row) => acc + row.cost, 0) -
          monthReturns.reduce((acc, row) => acc + row.costReversal, 0)

        const monthName = new Date(2024, i, 1).toLocaleString("es-ES", { month: "long" })

        chartData.push({
          name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          Ingresos: monthIncome,
          Gastos: monthCosts + monthlySpecialExpense,
          Ganancia: monthIncome - monthCosts - monthlySpecialExpense,
        })
      }
    } else if (reportType === "semiannual") {
      const semesterStart = Number.parseInt(selectedPeriod) * 6
      const semesterEnd = semesterStart + 6

      filteredSales = buildSalesRows(
        yearSales.filter((s) => {
          const m = new Date(s.date).getMonth()
          return m >= semesterStart && m < semesterEnd
        }),
      )
      filteredReturns = buildReturnRows(
        yearReturns.filter((r) => {
          const m = new Date(r.date).getMonth()
          return m >= semesterStart && m < semesterEnd
        }),
      )
      filteredRepairs = showOnlyAlmacen
        ? []
        : yearRepairs.filter((r) => {
          const m = new Date(r.date).getMonth()
          return m >= semesterStart && m < semesterEnd
        })
      filteredDebtPayments = yearDebtPayments.filter((payment) => {
        const m = new Date(payment.date).getMonth()
        return m >= semesterStart && m < semesterEnd
      })

      // Filter expenses for the same semester
      filteredExpenses = yearExpenses.filter((e) => {
        const m = new Date(e.date).getMonth()
        return !isSpecialExpense(e) && m >= semesterStart && m < semesterEnd
      })

      for (let i = semesterStart; i < semesterEnd; i++) {
        const monthSales = filteredSales.filter(({ sale }) => new Date(sale.date).getMonth() === i)
        const monthReturns = filteredReturns.filter(({ returnRecord }) => new Date(returnRecord.date).getMonth() === i)
        const monthRepairs = filteredRepairs.filter((r) => new Date(r.date).getMonth() === i)
        const monthDebtPayments = filteredDebtPayments.filter((payment) => new Date(payment.date).getMonth() === i)

        const monthIncome =
          monthSales.reduce((acc, row) => acc + row.total, 0) -
          monthReturns.reduce((acc, row) => acc + row.total, 0) +
          monthRepairs.reduce((acc, r) => acc + Number.parseFloat(r.cost || "0"), 0) +
          monthDebtPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
        const monthCosts =
          monthSales.reduce((acc, row) => acc + row.cost, 0) -
          monthReturns.reduce((acc, row) => acc + row.costReversal, 0)

        const monthName = new Date(2024, i, 1).toLocaleString("es-ES", { month: "long" })

        chartData.push({
          name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          Ingresos: monthIncome,
          Gastos: monthCosts + monthlySpecialExpense,
          Ganancia: monthIncome - monthCosts - monthlySpecialExpense,
        })
      }
    } else if (reportType === "daily") {
      const selectedDateObj = new Date(selectedDate)
      const selectedDateStr = selectedDateObj.toISOString().split('T')[0]

      filteredSales = buildSalesRows(
        yearSales.filter((s) => {
          const saleDate = new Date(s.date).toISOString().split('T')[0]
          return saleDate === selectedDateStr
        }),
      )
      filteredReturns = buildReturnRows(
        yearReturns.filter((r) => {
          const returnDate = new Date(r.date).toISOString().split('T')[0]
          return returnDate === selectedDateStr
        }),
      )
      filteredRepairs = showOnlyAlmacen
        ? []
        : yearRepairs.filter((r) => {
          const repairDate = new Date(r.date).toISOString().split('T')[0]
          return repairDate === selectedDateStr
        })
      filteredDebtPayments = yearDebtPayments.filter((payment) => new Date(payment.date).toISOString().split("T")[0] === selectedDateStr)

      // Filter expenses for the selected day
      filteredExpenses = yearExpenses.filter((e) => {
        const expenseDate = new Date(e.date).toISOString().split('T')[0]
        return !isSpecialExpense(e) && expenseDate === selectedDateStr
      })

      // Para el reporte diario, agrupar por hora
      const hourlyData: { [hour: number]: { income: number; costs: number; count: number } } = {}

      // Inicializar todas las horas del día
      for (let hour = 0; hour < 24; hour++) {
        hourlyData[hour] = { income: 0, costs: 0, count: 0 }
      }

      // Agregar ventas por hora
      filteredSales.forEach((row) => {
        const saleHour = new Date(row.sale.date).getHours()
        hourlyData[saleHour].income += row.total
        hourlyData[saleHour].costs += row.cost
        hourlyData[saleHour].count += 1
      })

      filteredReturns.forEach((row) => {
        const returnHour = new Date(row.returnRecord.date).getHours()
        hourlyData[returnHour].income -= row.total
        hourlyData[returnHour].costs -= row.costReversal
      })

      // Agregar reparaciones por hora
      filteredRepairs.forEach((repair) => {
        const repairHour = new Date(repair.date).getHours()
        hourlyData[repairHour].income += Number.parseFloat(repair.cost || "0")
      })

      filteredDebtPayments.forEach((payment) => {
        const paymentHour = new Date(payment.date).getHours()
        hourlyData[paymentHour].income += Number(payment.amount || 0)
      })

      // Crear datos para el gráfico
      for (let hour = 0; hour < 24; hour++) {
        if (hourlyData[hour].income > 0 || hourlyData[hour].costs > 0) {
          chartData.push({
            name: `${hour.toString().padStart(2, '0')}:00`,
            Ingresos: hourlyData[hour].income,
            Gastos: hourlyData[hour].costs,
            Ganancia: hourlyData[hour].income - hourlyData[hour].costs,
          })
        }
      }

      // Si no hay datos, agregar un punto con cero
      if (chartData.length === 0) {
        chartData.push({
          name: selectedDateObj.toLocaleDateString('es-ES', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          }),
          Ingresos: 0,
          Gastos: 0,
          Ganancia: 0,
        })
      }
    }

    summary.income =
      filteredSales.reduce((acc, row) => acc + row.total, 0) +
      filteredReturns.reduce((acc, row) => acc - row.total, 0) +
      filteredRepairs.reduce((acc, r) => acc + Number.parseFloat(r.cost || "0"), 0) +
      filteredDebtPayments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
    summary.costs =
      filteredSales.reduce((acc, row) => acc + row.cost, 0) -
      filteredReturns.reduce((acc, row) => acc + row.costReversal, 0)
    // Total expenses for the selected period (do not affect summary.costs)
    const regularExpenses = filteredExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0)
    const specialExpenseAllocation =
      reportType === "annual"
        ? specialExpenseTotal
        : reportType === "quarterly"
          ? monthlySpecialExpense * 3
          : reportType === "semiannual"
            ? monthlySpecialExpense * 6
            : reportType === "monthly"
              ? monthlySpecialExpense
              : 0
    const totalExpenses = regularExpenses + specialExpenseAllocation
    summary.profit = summary.income - summary.costs - totalExpenses
    summary.salesCount = filteredSales.length
    summary.repairsCount = filteredRepairs.length

    // Wholesale (por mayor) metrics
    const wholesaleSales = filteredSales.filter(({ sale }) => sale.isWholesale === true)
    const wholesaleReturns = filteredReturns.filter(({ sale }) => sale?.isWholesale === true)
    const wholesaleIncome =
      wholesaleSales.reduce((acc, row) => acc + row.total, 0) -
      wholesaleReturns.reduce((acc, row) => acc + row.total, 0)
    const wholesaleCosts =
      wholesaleSales.reduce((acc, row) => acc + row.cost, 0) -
      wholesaleReturns.reduce((acc, row) => acc + row.costReversal, 0)
    const wholesaleProfit = wholesaleIncome - wholesaleCosts
    // summary reúne ventas normales, ventas mayoristas, reparaciones,
    // devoluciones y gastos del período seleccionado.
    const netProfit = summary.income - summary.costs - totalExpenses
    summary.profit = netProfit

    return {
      chartData,
      summary,
      netProfit,
      filteredSales,
      filteredDebtPayments,
      filteredRepairs,
      wholesaleSales,
      wholesaleIncome,
      wholesaleCosts,
      wholesaleProfit,
    }
  }, [sales, returns, repairs, expenses, payments, paymentAllocations, selectedYear, reportType, selectedPeriod, selectedDate, showOnlyAlmacen, almacenProductIds])

  const handlePrint = () => {
    window.print()
  }

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()

    const summaryData = [
      ["Reporte Financiero", `Año: ${selectedYear}`, `Periodo: ${reportType}`],
      [""],
      ["Filtro", showOnlyAlmacen ? "Solo productos de almacen" : "Todos los productos"],
      [""],
      ["Concepto", "Monto"],
      ["Ingresos Totales", reportData.summary.income],
      ["Costos Totales", reportData.summary.costs],
      ["Ganancia Neta", reportData.netProfit],
      ["Margen", `${((reportData.netProfit / reportData.summary.income) * 100 || 0).toFixed(2)}%`],
      [""],
      ["--- Ventas al por Mayor ---", ""],
      ["Ingresos por Mayor", reportData.wholesaleIncome],
      ["Costos por Mayor", reportData.wholesaleCosts],
      ["Ganancia por Mayor", reportData.wholesaleProfit],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen")

    const salesData = reportData.filteredSales.map((row) => ({
      Fecha: new Date(row.sale.date).toLocaleDateString(),
      Factura: row.sale.invoiceNumber,
      Cliente: row.sale.customerName || "Cliente General",
      Total: row.total,
      Items: row.items.length,
      "Por Mayor": row.sale.isWholesale ? "Sí" : "No",
    }))
    const wsSales = XLSX.utils.json_to_sheet(salesData)
    XLSX.utils.book_append_sheet(wb, wsSales, "Ventas")

    const repairsData = reportData.filteredRepairs.map((r) => ({
      Fecha: new Date(r.date).toLocaleDateString(),
      Cliente: r.client,
      Dispositivo: `${r.deviceType} ${r.brand} ${r.model}`,
      Problema: r.issue,
      Costo: Number.parseFloat(r.cost || "0"),
    }))
    const wsRepairs = XLSX.utils.json_to_sheet(repairsData)
    XLSX.utils.book_append_sheet(wb, wsRepairs, "Reparaciones")

    const wholesaleData = reportData.wholesaleSales.map((row) => ({
      Fecha: new Date(row.sale.date).toLocaleDateString(),
      Factura: row.sale.invoiceNumber,
      Cliente: row.sale.customerName || "Cliente General",
      Ingresos: row.total,
      Costos: row.cost,
      Ganancia: row.total - row.cost,
      Items: row.items.length,
    }))
    const wsWholesale = XLSX.utils.json_to_sheet(wholesaleData)
    XLSX.utils.book_append_sheet(wb, wsWholesale, "Ventas por Mayor")

    XLSX.writeFile(
      wb,
      `Reporte_Financiero_${selectedYear}_${reportType}${showOnlyAlmacen ? "_solo_almacen" : ""}.xlsx`,
    )
  }

  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]

  const profitMargin =
    reportData.summary.income > 0 ? ((reportData.netProfit / reportData.summary.income) * 100).toFixed(1) : "0"

  const renderChart = () => {
    const commonProps = {
      data: reportData.chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 },
    }

    if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip
            formatter={(value: number) => [`$${formatCurrency(value)}`, undefined]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="Ingresos"
            stroke="#22c55e"
            strokeWidth={3}
            dot={{ fill: "#22c55e", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="Gastos"
            stroke="#ef4444"
            strokeWidth={3}
            dot={{ fill: "#ef4444", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="Ganancia"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ fill: "#3b82f6", strokeWidth: 2 }}
          />
        </LineChart>
      )
    }

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip
            formatter={(value: number) => [`$${formatCurrency(value)}`, undefined]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Legend />
          <Area type="monotone" dataKey="Ingresos" stroke="#22c55e" fill="url(#colorIngresos)" strokeWidth={2} />
          <Area type="monotone" dataKey="Gastos" stroke="#ef4444" fill="url(#colorGastos)" strokeWidth={2} />
        </AreaChart>
      )
    }

    return (
      <BarChart {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => [`$${formatCurrency(value)}`, undefined]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
        />
        <Legend />
        <Bar dataKey="Ingresos" fill="#22c55e" radius={[6, 6, 0, 0]} />
        <Bar dataKey="Gastos" fill="#ef4444" radius={[6, 6, 0, 0]} />
      </BarChart>
    )
  }

  return (
    <div className="space-y-6 p-4 pb-20">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-content, #report-content * { visibility: visible; }
          #report-content { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col gap-6 no-print">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button onClick={handlePrint} variant="outline" className="gap-2 bg-transparent">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button onClick={handleExportExcel} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
              onClick={() => setShowOnlyAlmacen((prev) => !prev)}
              variant={showOnlyAlmacen ? "default" : "outline"}
              className={showOnlyAlmacen ? "gap-2" : "gap-2 bg-transparent"}
            >
              {showOnlyAlmacen ? "Solo almacen: activo" : "Solo almacen"}
            </Button>
          </div>
        </div>

        {/* Filtros mejorados */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Año:</span>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Periodo:</span>
                <Select
                  value={reportType}
                  onValueChange={(val) => {
                    setReportType(val)
                    if (val === "monthly") setSelectedPeriod(new Date().getMonth().toString())
                    if (val === "quarterly") setSelectedPeriod("0")
                    if (val === "semiannual") setSelectedPeriod("0")
                    if (val === "daily") {
                      const today = new Date()
                      setSelectedDateYear(today.getFullYear().toString())
                      setSelectedDateMonth((today.getMonth() + 1).toString())
                      setSelectedDateDay(today.getDate().toString())
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Frecuencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportType === "daily" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Fecha:</span>
                  <Select value={selectedDateYear} onValueChange={setSelectedDateYear}>
                    <SelectTrigger className="w-[100px]">
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
                  <Select value={selectedDateMonth} onValueChange={setSelectedDateMonth}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Mes" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem key={month} value={(index + 1).toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedDateDay} onValueChange={setSelectedDateDay}>
                    <SelectTrigger className="w-[90px]">
                      <SelectValue placeholder="Día" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: daysInSelectedMonth }, (_, index) => index + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {reportType === "monthly" && (
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {reportType === "quarterly" && (
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Trimestre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">T1 (Ene-Mar)</SelectItem>
                    <SelectItem value="1">T2 (Abr-Jun)</SelectItem>
                    <SelectItem value="2">T3 (Jul-Sep)</SelectItem>
                    <SelectItem value="3">T4 (Oct-Dic)</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {reportType === "semiannual" && (
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Semestre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">S1 (Ene-Jun)</SelectItem>
                    <SelectItem value="1">S2 (Jul-Dic)</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="text-sm font-medium text-muted-foreground">Gráfico:</span>
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    variant={chartType === "bar" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                    onClick={() => setChartType("bar")}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartType === "line" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none border-x"
                    onClick={() => setChartType("line")}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartType === "area" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none"
                    onClick={() => setChartType("area")}
                  >
                    <PieChart className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="report-content" className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-600">${formatCurrency(reportData.summary.income)}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center text-emerald-600">
                  <ArrowUpRight className="h-3 w-3" />
                  {reportData.summary.salesCount} ventas
                </span>
                <span>+</span>
                <span>{reportData.summary.repairsCount} reparaciones</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full -mr-16 -mt-16" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costos Totales</CardTitle>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-600">${formatCurrency(reportData.summary.costs)}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center text-red-600">
                  <ArrowDownRight className="h-3 w-3" />
                </span>
                <span>Costo de mercancía vendida</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ganancia Neta</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-xl sm:text-2xl lg:text-3xl font-bold ${reportData.netProfit >= 0 ? "text-blue-600" : "text-red-600"}`}
              >
                ${formatCurrency(reportData.netProfit)}
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span>Ingresos - Costos</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full -mr-16 -mt-16" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Margen de Ganancia</CardTitle>
              <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-violet-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-violet-600">{profitMargin}%</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span>Rentabilidad bruta</span>
              </div>
            </CardContent>
          </Card>

          {/* Wholesale card */}
          <Card className="relative overflow-hidden border-2 border-orange-500/30">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full -mr-16 -mt-16" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ganancia por Mayor</CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-xl sm:text-2xl lg:text-3xl font-bold ${reportData.wholesaleProfit >= 0 ? "text-orange-600" : "text-red-600"}`}
              >
                ${formatCurrency(reportData.wholesaleProfit)}
              </div>
              <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
                <span>{reportData.wholesaleSales.length} ventas por mayor</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {reportType !== "daily" || reportData.chartData.length > 1 ? (
          <Card className="no-print">
            <CardHeader>

            </CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="ventas" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="ventas" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Ventas ({reportData.filteredSales.length + reportData.filteredDebtPayments.length})
            </TabsTrigger>
            <TabsTrigger value="reparaciones" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Reparaciones ({reportData.filteredRepairs.length})
            </TabsTrigger>
            <TabsTrigger value="por-mayor" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Por Mayor ({reportData.wholesaleSales.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ventas">
            <Card>
              <CardHeader>
                <CardTitle>Desglose de Ventas y Abonos</CardTitle>
                <CardDescription>Ventas y pagos recibidos en el periodo seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Cliente</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.filteredSales.length === 0 && reportData.filteredDebtPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No hay ventas ni abonos en este periodo
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {reportData.filteredSales.map((row) => (
                          <TableRow key={`sale-${row.sale.id}`}>
                            <TableCell>{new Date(row.sale.date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-mono text-sm">{row.sale.invoiceNumber}</TableCell>
                            <TableCell>{row.sale.customerName || "Cliente General"}</TableCell>
                            <TableCell>{row.items.length} productos</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">
                              ${formatCurrency(row.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {reportData.filteredDebtPayments.map((payment) => {
                          const paymentCustomerName =
                            payment.customerName || customers.find((customer) => customer.id === payment.customerId)?.name || "Cliente General"

                          return (
                            <TableRow key={`payment-${payment.id}`} className="bg-emerald-50/50 dark:bg-emerald-950/20">
                              <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                              <TableCell className="font-mono text-sm">{payment.invoiceNumber}</TableCell>
                              <TableCell>{paymentCustomerName}</TableCell>
                              <TableCell>Pago recibido</TableCell>
                              <TableCell className="text-right font-bold text-emerald-600">
                                ${formatCurrency(Number(payment.amount || 0))}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reparaciones">
            <Card>
              <CardHeader>
                <CardTitle>Desglose de Reparaciones</CardTitle>
                <CardDescription>Todas las reparaciones completadas del periodo</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>Problema</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.filteredRepairs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No hay reparaciones en este periodo
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.filteredRepairs.map((repair) => (
                        <TableRow key={repair.id}>
                          <TableCell>{new Date(repair.date).toLocaleDateString()}</TableCell>
                          <TableCell>{repair.client}</TableCell>
                          <TableCell>
                            {repair.deviceType} {repair.brand} {repair.model}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{repair.issue}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">
                            ${formatCurrency(Number.parseFloat(repair.cost || "0"))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ventas por Mayor Tab */}
          <TabsContent value="por-mayor">
            <Card className="border-orange-500/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle>Ventas al por Mayor</CardTitle>
                    <CardDescription>
                      Ventas realizadas desde el módulo /ventas-por-mayor en el periodo seleccionado
                    </CardDescription>
                  </div>
                </div>
                {reportData.wholesaleSales.length > 0 && (
                  <div className="flex gap-6 pt-2 border-t mt-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Ingresos: </span>
                      <span className="font-semibold text-emerald-600">${formatCurrency(reportData.wholesaleIncome)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Costos: </span>
                      <span className="font-semibold text-red-600">${formatCurrency(reportData.wholesaleCosts)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Ganancia: </span>
                      <span className={`font-bold ${reportData.wholesaleProfit >= 0 ? "text-orange-600" : "text-red-600"}`}>
                        ${formatCurrency(reportData.wholesaleProfit)}
                      </span>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Costos</TableHead>
                      <TableHead className="text-right">Ganancia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.wholesaleSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <ShoppingBag className="h-8 w-8 opacity-30" />
                            <span>No hay ventas al por mayor en este periodo</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.wholesaleSales.map((row) => {
                        const rowProfit = row.total - row.cost
                        return (
                          <TableRow key={row.sale.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/10">
                            <TableCell>{new Date(row.sale.date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-mono text-sm">{row.sale.invoiceNumber}</TableCell>
                            <TableCell>{row.sale.customerName || "Cliente General"}</TableCell>
                            <TableCell className="text-center">{row.items.length} prod.</TableCell>
                            <TableCell className="text-right font-semibold text-emerald-600">
                              ${formatCurrency(row.total)}
                            </TableCell>
                            <TableCell className="text-right text-red-500">
                              ${formatCurrency(row.cost)}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${rowProfit >= 0 ? "text-orange-600" : "text-red-600"}`}>
                              ${formatCurrency(rowProfit)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                    {reportData.wholesaleSales.length > 1 && (
                      <TableRow className="border-t-2 bg-orange-50/50 dark:bg-orange-900/10 font-bold">
                        <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">
                          Totales ({reportData.wholesaleSales.length} ventas)
                        </TableCell>
                        <TableCell className="text-right text-emerald-600">
                          ${formatCurrency(reportData.wholesaleIncome)}
                        </TableCell>
                        <TableCell className="text-right text-red-500">
                          ${formatCurrency(reportData.wholesaleCosts)}
                        </TableCell>
                        <TableCell className={`text-right ${reportData.wholesaleProfit >= 0 ? "text-orange-600" : "text-red-600"}`}>
                          ${formatCurrency(reportData.wholesaleProfit)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
