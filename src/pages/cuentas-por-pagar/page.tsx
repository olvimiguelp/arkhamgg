"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, HandCoins, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useStore, type AccountPayable } from "@/components/store-context";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";

const money = (value: number) =>
  `RD$ ${value.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`;
type AccountPaymentHistory = {
  id: string;
  amount: number;
  paymentMethod: "cash" | "card" | "transfer";
  note?: string;
  createdAt: string;
};
type SupplierInvoiceHistory = {
  id: string;
  supplier: string;
  concept: string;
  origin: string;
  total: number;
  paid: number;
  dueDate?: string;
  status: string;
};
const categories: Record<AccountPayable["category"], string> = {
  mercancia: "Mercancía / materia prima",
  nomina: "Sueldos y personal",
  servicios: "Servicios (luz, agua, internet)",
  alquiler: "Alquiler / arrendamiento",
  mantenimiento: "Mantenimiento y reparación",
  activos: "Equipos y activos fijos",
  transporte: "Transporte y combustible",
  publicidad: "Publicidad y mercadeo",
  seguros: "Seguros",
  financieros: "Gastos financieros / bancarios",
  impuestos: "Impuestos y tasas",
  otros: "Otros gastos",
};

export default function CuentasPorPagarPage() {
  const {
    purchases,
    accountsPayable,
    suppliers,
    addAccountPayable,
    addAccountPayablePayment,
    updateAccountPayablePayment,
    deleteAccountPayablePayment,
    canCurrentUserPerform,
    setOnDialogOpen,
    currentUser,
  } = useStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState("");
  const [selectedAccountPayable, setSelectedAccountPayable] =
    useState<AccountPayable | null>(null);
  const [accountPaymentAmount, setAccountPaymentAmount] = useState(0);
  const [accountPaymentMethod, setAccountPaymentMethod] = useState<
    "cash" | "card" | "transfer"
  >("cash");
  const [accountPaymentDate, setAccountPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [accountPaymentFromCash, setAccountPaymentFromCash] = useState(true);
  const [accountPaymentNote, setAccountPaymentNote] = useState("");
  const [accountPaymentSaving, setAccountPaymentSaving] = useState(false);
  const [accountPaymentHistory, setAccountPaymentHistory] = useState<
    AccountPaymentHistory[]
  >([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [supplierHistory, setSupplierHistory] = useState<{
    supplier: string;
    invoices: SupplierInvoiceHistory[];
  } | null>(null);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "overdue" | "week" | "month"
  >("all");
  const [search, setSearch] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [category, setCategory] = useState<AccountPayable["category"]>("otros");
  const [concept, setConcept] = useState("");
  const [supplierId, setSupplierId] = useState("none");
  const [supplierName, setSupplierName] = useState("");
  const [supplierRnc, setSupplierRnc] = useState("");
  const [hasNcf, setHasNcf] = useState(false);
  const [ncf, setNcf] = useState("");
  const [amount, setAmount] = useState(0);
  const [includesItbis, setIncludesItbis] = useState(true);
  const [itbisRate, setItbisRate] = useState(18);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setOnDialogOpen?.(() => setOpen(true));
    return () => setOnDialogOpen?.(() => {});
  }, [setOnDialogOpen]);

  const rows = useMemo(
    () =>
      [
        ...purchases
          .filter(
            (item) => item.status !== "pagado" && item.total > item.amountPaid,
          )
          .map((item) => ({
            id: item.id,
            accountPayableId: undefined,
            supplierId: item.supplierId,
            supplier: item.supplierName,
            concept: item.supplierInvoiceNumber || item.invoiceNumber,
            ncf: item.ncf || "—",
            origin: "Compra de mercancía",
            total: item.total,
            paid: item.amountPaid,
            dueDate: item.dueDate,
          })),
        ...accountsPayable
          .filter(
            (item) =>
              item.status !== "pagado" && item.totalAmount > item.amountPaid,
          )
          .map((item) => ({
            id: item.id,
            accountPayableId: item.id,
            supplierId: item.supplierId,
            supplier: item.supplierName || "Proveedor ad-hoc",
            concept: item.concept,
            ncf: item.ncf || "—",
            origin: "Gasto general",
            total: item.totalAmount,
            paid: item.amountPaid,
            dueDate: item.dueDate,
          })),
      ].filter((item) => {
        const days = item.dueDate
          ? Math.ceil(
              (new Date(item.dueDate).getTime() - Date.now()) / 86400000,
            )
          : 999;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "overdue" && days < 0) ||
          (statusFilter === "week" && days >= 0 && days <= 7) ||
          (statusFilter === "month" && days >= 0 && days <= 30);
        const text =
          `${item.supplier} ${item.concept} ${item.ncf}`.toLowerCase();
        return (
          matchesStatus &&
          (supplierFilter === "all" || item.supplierId === supplierFilter) &&
          (!search.trim() || text.includes(search.trim().toLowerCase()))
        );
      }),
    [accountsPayable, purchases, search, statusFilter, supplierFilter],
  );
  const totalDebt = rows.reduce((sum, item) => sum + item.total - item.paid, 0);
  const overdue = rows
    .filter((item) => item.dueDate && new Date(item.dueDate) < new Date())
    .reduce((sum, item) => sum + item.total - item.paid, 0);
  const supplierBalances = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supplierId?: string;
        supplier: string;
        total: number;
        documents: number;
      }
    >();
    rows.forEach((row) => {
      const key = row.supplierId || `name:${row.supplier}`;
      const current = grouped.get(key) || {
        supplierId: row.supplierId,
        supplier: row.supplier,
        total: 0,
        documents: 0,
      };
      current.total += row.total - row.paid;
      current.documents += 1;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [rows]);
  const base = includesItbis ? amount / (1 + itbisRate / 100) : amount;
  const itbis = includesItbis ? amount - base : (amount * itbisRate) / 100;
  const total = includesItbis ? amount : amount + itbis;

  const reset = () => {
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setCategory("otros");
    setConcept("");
    setSupplierId("none");
    setSupplierName("");
    setSupplierRnc("");
    setHasNcf(false);
    setNcf("");
    setAmount(0);
    setIncludesItbis(true);
    setItbisRate(18);
    setDueDate("");
    setNote("");
  };
  const save = async () => {
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!canCurrentUserPerform("canAdd")) return;
    if (
      !concept.trim() ||
      amount <= 0 ||
      (supplierId === "none" && !supplierName.trim()) ||
      (hasNcf && !ncf.trim()) ||
      !dueDate
    ) {
      toast({
        title: "Completa los campos obligatorios",
        variant: "destructive",
      });
      return;
    }
    try {
      await addAccountPayable({
        expenseDate: `${expenseDate}T12:00:00.000Z`,
        category,
        concept: concept.trim(),
        supplierId: supplier?.id,
        supplierName: supplier?.name || supplierName.trim(),
        supplierRnc: supplierRnc.trim() || undefined,
        hasNcf,
        ncf: hasNcf ? ncf.trim() : undefined,
        amount,
        amountIncludesItbis: includesItbis,
        itbisRate,
        itbisAmount: itbis,
        baseAmount: base,
        totalAmount: total,
        paymentType: "credito",
        dueDate: `${dueDate}T23:59:59.000Z`,
        note: note.trim() || undefined,
      });
      toast({ title: "Gasto registrado" });
      setOpen(false);
      reset();
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : "Revisa los datos y la conexión con la base de datos.";
      toast({
        title: "No se pudo registrar el gasto",
        description,
        variant: "destructive",
      });
    }
  };

  const openAccountPayment = (accountId: string) => {
    const account = accountsPayable.find((item) => item.id === accountId);
    if (!account) return;
    setSelectedAccountPayable(account);
    setAccountPaymentAmount(
      Math.max(0, account.totalAmount - account.amountPaid),
    );
    setAccountPaymentMethod("cash");
    setAccountPaymentDate(new Date().toISOString().slice(0, 10));
    setAccountPaymentFromCash(true);
    setAccountPaymentNote("");
    setEditingPaymentId(null);
    setAccountPaymentHistory([]);
    void createClient()
      .from("accounts_payable_payments")
      .select("id, amount, payment_method, note, created_at")
      .eq("account_payable_id", account.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAccountPaymentHistory(
          (data || []).map((payment) => ({
            id: String(payment.id),
            amount: Number(payment.amount) || 0,
            paymentMethod:
              payment.payment_method === "card" ||
              payment.payment_method === "transfer"
                ? payment.payment_method
                : "cash",
            note: payment.note || undefined,
            createdAt: String(payment.created_at),
          })),
        );
      });
  };

  const saveAccountPayment = async () => {
    const editingPayment = editingPaymentId ? accountPaymentHistory.find((payment) => payment.id === editingPaymentId) : undefined;
    const maximumAmount = selectedAccountPayable ? selectedAccountPayable.totalAmount - selectedAccountPayable.amountPaid + (editingPayment?.amount || 0) : 0;
    if (
      !selectedAccountPayable ||
      accountPaymentAmount <= 0 ||
      accountPaymentAmount > maximumAmount
    ) {
      toast({
        title: "Abono inválido",
        description: "El monto debe estar entre 0 y el balance pendiente.",
        variant: "destructive",
      });
      return;
    }
    setAccountPaymentSaving(true);
    try {
      const note = [accountPaymentDate, accountPaymentNote.trim()]
        .filter(Boolean)
        .join(" · ");
      const paymentMethod = accountPaymentFromCash ? "cash" : accountPaymentMethod;
      if (editingPaymentId) {
        await updateAccountPayablePayment(editingPaymentId, selectedAccountPayable.id, accountPaymentAmount, paymentMethod, note || undefined);
      } else {
        await addAccountPayablePayment(selectedAccountPayable.id, accountPaymentAmount, paymentMethod, note || undefined);
      }
      toast({ title: editingPaymentId ? "Abono corregido" : "Abono registrado" });
      openAccountPayment(selectedAccountPayable.id);
      setEditingPaymentId(null);
    } catch (error) {
      toast({
        title: "No se pudo registrar el abono",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAccountPaymentSaving(false);
    }
  };

  const editAccountPayment = (payment: AccountPaymentHistory) => {
    setEditingPaymentId(payment.id);
    setAccountPaymentAmount(payment.amount);
    setAccountPaymentMethod(payment.paymentMethod);
    setAccountPaymentFromCash(payment.paymentMethod === "cash");
    const [date, ...noteParts] = (payment.note || "").split(" · ");
    setAccountPaymentDate(date || new Date(payment.createdAt).toISOString().slice(0, 10));
    setAccountPaymentNote(noteParts.join(" · "));
  };

  const removeAccountPayment = async (payment: AccountPaymentHistory) => {
    if (!selectedAccountPayable || !window.confirm("¿Eliminar este abono? El balance de la cuenta será restaurado.")) return;
    try {
      await deleteAccountPayablePayment(payment.id, selectedAccountPayable.id, payment.amount);
      toast({ title: "Abono eliminado" });
      openAccountPayment(selectedAccountPayable.id);
    } catch (error) {
      toast({ title: "No se pudo eliminar el abono", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const openSupplierHistory = (supplier: {
    supplierId?: string;
    supplier: string;
  }) => {
    const invoices = [
      ...purchases
        .filter(
          (item) =>
            (supplier.supplierId && item.supplierId === supplier.supplierId) ||
            (!supplier.supplierId && item.supplierName === supplier.supplier),
        )
        .map((item) => ({
          id: item.id,
          supplier: item.supplierName,
          concept: item.supplierInvoiceNumber || item.invoiceNumber,
          origin: "Compra de mercancía",
          total: item.total,
          paid: item.amountPaid,
          dueDate: item.dueDate,
          status: item.status === "pagado" ? "Pagada" : item.amountPaid > 0 ? "Abonada" : "Pendiente",
        })),
      ...accountsPayable
        .filter(
          (item) =>
            (supplier.supplierId && item.supplierId === supplier.supplierId) ||
            (!supplier.supplierId && item.supplierName === supplier.supplier),
        )
        .map((item) => ({
          id: item.id,
          supplier: item.supplierName || "Proveedor ad-hoc",
          concept: item.concept,
          origin: "Gasto general",
          total: item.totalAmount,
          paid: item.amountPaid,
          dueDate: item.dueDate,
          status: item.status === "pagado" ? "Pagada" : item.amountPaid > 0 ? "Abonada" : "Pendiente",
        })),
    ].sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
    setSupplierHistory({ supplier: supplier.supplier, invoices });
  };

  const editingPayment = editingPaymentId ? accountPaymentHistory.find((payment) => payment.id === editingPaymentId) : undefined;
  const maximumAmount = selectedAccountPayable ? selectedAccountPayable.totalAmount - selectedAccountPayable.amountPaid + (editingPayment?.amount || 0) : 0;

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Deuda total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-amber-300">
            {money(totalDebt)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Vencido
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-red-400">
            {money(overdue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Vence en 7 días
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {money(
              rows
                .filter(
                  (item) =>
                    item.dueDate &&
                    new Date(item.dueDate).getTime() - Date.now() <= 604800000,
                )
                .reduce((sum, item) => sum + item.total - item.paid, 0),
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Vence en 30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {money(rows.reduce((sum, item) => sum + item.total - item.paid, 0))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Documentos abiertos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{rows.length}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <FileText className="h-4 w-4" /> Balance por proveedor
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {supplierBalances.map((supplier) => (
            <button
              key={supplier.supplierId || supplier.supplier}
              className="rounded-lg border px-4 py-2 text-left hover:bg-accent"
              onClick={() => openSupplierHistory(supplier)}
            >
              <span className="block font-semibold">{supplier.supplier}</span>
              <span className="text-xs text-muted-foreground">
                {money(supplier.total)} · {supplier.documents} doc.
              </span>
            </button>
          ))}
          {supplierBalances.length === 0 && (
            <span className="text-sm text-muted-foreground">
              No hay balances pendientes por proveedor.
            </span>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={statusFilter === "all" ? "destructive" : "secondary"}
          onClick={() => setStatusFilter("all")}
        >
          Todo lo pendiente
        </Button>
        <Button
          size="sm"
          variant={statusFilter === "overdue" ? "destructive" : "secondary"}
          onClick={() => setStatusFilter("overdue")}
        >
          Vencido
        </Button>
        <Button
          size="sm"
          variant={statusFilter === "week" ? "destructive" : "secondary"}
          onClick={() => setStatusFilter("week")}
        >
          Vence en 7 días
        </Button>
        <Button
          size="sm"
          variant={statusFilter === "month" ? "destructive" : "secondary"}
          onClick={() => setStatusFilter("month")}
        >
          Vence en 30 días
        </Button>
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Concepto, proveedor o NCF..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vence</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>NCF</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Abonado</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.dueDate
                      ? new Date(row.dueDate).toLocaleDateString("es-DO")
                      : "—"}
                  </TableCell>
                  <TableCell className="font-medium">{row.supplier}</TableCell>
                  <TableCell>
                    <div>{row.concept}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.origin}
                    </div>
                  </TableCell>
                  <TableCell>{row.ncf}</TableCell>
                  <TableCell>{money(row.total)}</TableCell>
                  <TableCell className="text-emerald-400">
                    {money(row.paid)}
                  </TableCell>
                  <TableCell className="font-semibold text-amber-300">
                    {money(row.total - row.paid)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (row.accountPayableId)
                          openAccountPayment(row.accountPayableId);
                        else if (row.supplierId) {
                          setPaymentSupplierId(row.supplierId);
                          setPaymentOpen(true);
                        }
                      }}
                      disabled={!row.accountPayableId && !row.supplierId}
                    >
                      <HandCoins className="mr-1 h-4 w-4" /> Abonar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hay cuentas pendientes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) reset();
        }}
      >
        <DialogContent className="h-[75vh] max-h-[90vh] w-[75vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva cuenta por pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Fecha del gasto</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select
                  value={category}
                  onValueChange={(value: AccountPayable["category"]) =>
                    setCategory(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categories).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Concepto</Label>
              <Input
                placeholder="Compra de pollo, factura de la luz, sueldo quincena..."
                value={concept}
                onChange={(event) => setConcept(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      — Sin proveedor del maestro —
                    </SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {supplierId === "none" && (
                  <Input
                    placeholder="O escribe el nombre del proveedor"
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                  />
                )}
              </div>
              <div>
                <Label>RNC / Cédula del proveedor</Label>
                <Input
                  placeholder="130123456"
                  value={supplierRnc}
                  onChange={(event) => setSupplierRnc(event.target.value)}
                />
              </div>
            </div>
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={hasNcf}
                  onCheckedChange={(checked) => setHasNcf(checked === true)}
                />
                <div>
                  <Label>Este gasto tiene comprobante fiscal (NCF)</Label>
                  <p className="text-xs text-muted-foreground">
                    Solo los gastos con comprobante deducen ITBIS y van al
                    reporte 606 de la DGII.
                  </p>
                </div>
              </div>
              {hasNcf && (
                <Input
                  className="mt-3"
                  placeholder="NCF"
                  value={ncf}
                  onChange={(event) => setNcf(event.target.value)}
                />
              )}
            </div>
            <div className="space-y-3">
              <Label>Monto e ITBIS</Label>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
                <Input
                  type="number"
                  min="0"
                  value={itbisRate}
                  onChange={(event) => setItbisRate(Number(event.target.value))}
                />
                <Badge className="h-9 px-3">{itbisRate}%</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={includesItbis}
                  onCheckedChange={(checked) =>
                    setIncludesItbis(checked === true)
                  }
                />
                <Label>El monto ya incluye el ITBIS</Label>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/70 p-3 text-sm">
                <span>
                  Base {money(base)} + ITBIS {money(itbis)}
                </span>
                <strong>Total {money(total)}</strong>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Forma de pago</Label>
                <Select value="credito" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credito">A crédito</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Una cuenta por pagar es, por definición, a crédito. Si ya la
                  pagaste, regístrala en Finanzas → Gastos.
                </p>
              </div>
              <div>
                <Label>Vence el</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Aparecerá en Cuentas por Pagar.
                </p>
              </div>
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Textarea
                placeholder="No. de factura, detalle, quién autorizó..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={save}>
              <Plus data-icon="inline-start" /> Registrar gasto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selectedAccountPayable)}
        onOpenChange={(value) => !value && setSelectedAccountPayable(null)}
      >
        <DialogContent className="h-[80vh] w-[85vw] max-w-[85vw] overflow-y-auto sm:max-w-[85vw]">
          <DialogHeader>
            <DialogTitle>
              {selectedAccountPayable?.supplierName || "Proveedor ad-hoc"} —{" "}
              {selectedAccountPayable?.concept}
            </DialogTitle>
          </DialogHeader>
          {selectedAccountPayable && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
                  <p>
                    <span className="text-muted-foreground">
                      Fecha del gasto
                    </span>
                    <strong className="float-right">
                      {new Date(
                        selectedAccountPayable.expenseDate,
                      ).toLocaleDateString("es-DO")}
                    </strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Vence</span>
                    <strong className="float-right">
                      {selectedAccountPayable.dueDate
                        ? new Date(
                            selectedAccountPayable.dueDate,
                          ).toLocaleDateString("es-DO")
                        : "—"}
                    </strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Total</span>
                    <strong className="float-right">
                      {money(selectedAccountPayable.totalAmount)}
                    </strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Abonado</span>
                    <strong className="float-right text-emerald-400">
                      {money(selectedAccountPayable.amountPaid)}
                    </strong>
                  </p>
                  <div className="border-t pt-3">
                    <span className="font-semibold">Balance</span>
                    <strong className="float-right text-lg text-amber-300">
                      {money(
                        selectedAccountPayable.totalAmount -
                          selectedAccountPayable.amountPaid,
                      )}
                    </strong>
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Historial de pagos
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {accountPaymentHistory.length} pago(s)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="px-2 py-2">Recibo</th>
                          <th className="px-2 py-2">Fecha</th>
                          <th className="px-2 py-2">Método</th>
                          <th className="px-2 py-2">Origen del dinero</th>
                          <th className="px-2 py-2">Registró</th>
                          <th className="px-2 py-2 text-right">Monto</th>
                          <th className="px-2 py-2 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountPaymentHistory.map((payment) => (
                          <tr key={payment.id} className="border-b last:border-0">
                            <td className="px-2 py-2 font-mono">
                              AB-{payment.id.slice(0, 6).toUpperCase()}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              {new Date(payment.createdAt).toLocaleDateString("es-DO")}
                            </td>
                            <td className="px-2 py-2">
                              {payment.paymentMethod === "cash"
                                ? "Efectivo"
                                : payment.paymentMethod === "card"
                                  ? "Tarjeta"
                                  : "Transferencia"}
                            </td>
                            <td className="px-2 py-2 text-emerald-500">
                              {payment.paymentMethod === "cash" ? "Caja abierta" : "Externo"}
                            </td>
                            <td className="px-2 py-2">
                              {currentUser?.name || "Administrador"}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-emerald-500">
                              {money(payment.amount)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button type="button" variant="ghost" size="icon" title="Corregir abono" onClick={() => editAccountPayment(payment)}>
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Corregir abono</span>
                                </Button>
                                <Button type="button" variant="ghost" size="icon" title="Eliminar abono" onClick={() => void removeAccountPayment(payment)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                  <span className="sr-only">Eliminar abono</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {accountPaymentHistory.length === 0 && (
                    <p className="py-4 text-sm text-muted-foreground">
                      No hay abonos registrados.
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label>Monto a abonar</Label>
                  <Input
                    type="number"
                    min="0"
                    max={maximumAmount}
                    value={accountPaymentAmount}
                    onChange={(event) =>
                      setAccountPaymentAmount(Number(event.target.value))
                    }
                  />
                </div>
                <div>
                  <Label>Forma de pago</Label>
                  <Select
                    value={accountPaymentMethod}
                    onValueChange={(value: "cash" | "card" | "transfer") =>
                      setAccountPaymentMethod(value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha del pago</Label>
                  <Input
                    type="date"
                    value={accountPaymentDate}
                    onChange={(event) =>
                      setAccountPaymentDate(event.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Referencia</Label>
                  <Input
                    value={accountPaymentNote}
                    onChange={(event) =>
                      setAccountPaymentNote(event.target.value)
                    }
                    placeholder="No. de cheque, transferencia..."
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={accountPaymentFromCash}
                  onCheckedChange={(checked) => {
                    setAccountPaymentFromCash(checked === true);
                    if (checked === true) setAccountPaymentMethod("cash");
                  }}
                />
                <span>
                  <strong className="block">
                    Sale del efectivo de mi caja abierta
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    El pago se registra como salida de efectivo.
                  </span>
                </span>
              </label>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedAccountPayable(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={saveAccountPayment}
                  disabled={accountPaymentSaving}
                >
                  <HandCoins className="mr-2 h-4 w-4" />
                  {accountPaymentSaving
                    ? "Guardando..."
                    : editingPaymentId
                      ? "Corregir abono"
                      : "Registrar abono"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SupplierPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        initialSupplierId={paymentSupplierId}
      />
      <Dialog
        open={Boolean(supplierHistory)}
        onOpenChange={(value) => !value && setSupplierHistory(null)}
      >
        <DialogContent className="max-h-[80vh] w-[85vw] max-w-[85vw] overflow-y-auto sm:max-w-[85vw]">
          <DialogHeader>
            <DialogTitle>Facturas de {supplierHistory?.supplier}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto rounded-xl border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura / concepto</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Abonado</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierHistory?.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.concept}</TableCell>
                    <TableCell>{invoice.origin}</TableCell>
                    <TableCell>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("es-DO") : "—"}</TableCell>
                    <TableCell>{invoice.status}</TableCell>
                    <TableCell className="text-right">{money(invoice.total)}</TableCell>
                    <TableCell className="text-right text-emerald-500">{money(invoice.paid)}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-300">{money(invoice.total - invoice.paid)}</TableCell>
                  </TableRow>
                ))}
                {supplierHistory?.invoices.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No hay facturas para este proveedor.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
