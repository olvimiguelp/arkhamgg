"use client"

import { useEffect, useMemo, useState } from "react"
import { HandCoins, UploadCloud } from "lucide-react"
import { useStore } from "@/components/store-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { isValidPurchaseAttachment, uploadPurchaseAttachment } from "@/lib/purchase-attachments-storage"

const money = (value: number) => `RD$ ${value.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`
const date = (value: string) => new Date(value).toLocaleDateString("es-DO")

export function SupplierPaymentDialog({ open, onOpenChange, initialSupplierId = "" }: { open: boolean; onOpenChange: (open: boolean) => void; initialSupplierId?: string }) {
  const { suppliers, purchases, addSupplierPayment, canCurrentUserPerform } = useStore()
  const { toast } = useToast()
  const [supplierId, setSupplierId] = useState(initialSupplierId)
  const [purchaseId, setPurchaseId] = useState("auto")
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [note, setNote] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setSupplierId(initialSupplierId) }, [initialSupplierId, open])
  const supplier = suppliers.find((item) => item.id === supplierId)
  const pending = useMemo(() => purchases.filter((purchase) => purchase.supplierId === supplierId && purchase.total - purchase.amountPaid > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [purchases, supplierId])

  const save = async () => {
    if (!canCurrentUserPerform("canAdd") || !supplier || amount <= 0 || amount > supplier.debt || pending.length === 0) {
      toast({ title: "Abono inválido", description: "Revisa el proveedor, el monto y sus facturas pendientes.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      let attachmentUrl: string | undefined
      if (file) {
        const result = await uploadPurchaseAttachment(file, "abonos")
        if (!result.success) throw new Error(result.error)
        attachmentUrl = result.publicUrl
      }
      await addSupplierPayment({ supplierId: supplier.id, purchaseId: purchaseId === "auto" ? undefined : purchaseId, amount, paymentMethod: method, note: note || undefined, attachmentUrl })
      toast({ title: "Abono registrado" })
      onOpenChange(false)
    } catch (error) {
      toast({ title: "No se pudo registrar el abono", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar abono a proveedor</DialogTitle></DialogHeader><FieldGroup><Field><FieldLabel>Proveedor</FieldLabel><Select value={supplierId} onValueChange={(value) => { setSupplierId(value); setPurchaseId("auto") }}><SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger><SelectContent><SelectGroup>{suppliers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · debe {money(item.debt)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>Factura a pagar</FieldLabel><Select value={purchaseId} onValueChange={setPurchaseId} disabled={!pending.length}><SelectTrigger><SelectValue placeholder="Automático" /></SelectTrigger><SelectContent><SelectItem value="auto">Automático: más antigua primero</SelectItem>{pending.map((purchase) => <SelectItem key={purchase.id} value={purchase.id}>{purchase.invoiceNumber} · {date(purchase.date)} · {money(purchase.total - purchase.amountPaid)}</SelectItem>)}</SelectContent></Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Monto</FieldLabel><Input type="number" min="0" max={supplier?.debt || 0} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field><FieldLabel>Método</FieldLabel><Select value={method} onValueChange={(value: "cash" | "card" | "transfer") => setMethod(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Efectivo</SelectItem><SelectItem value="card">Tarjeta</SelectItem><SelectItem value="transfer">Transferencia</SelectItem></SelectContent></Select></Field></div><Field><FieldLabel>Nota</FieldLabel><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field><Label className="flex items-center gap-1"><UploadCloud className="h-4 w-4" /> Comprobante opcional</Label><Input type="file" accept="application/pdf,image/*" onChange={(event) => { const next = event.target.files?.[0] || null; if (next && !isValidPurchaseAttachment(next)) { toast({ title: "Archivo no válido", variant: "destructive" }); event.target.value = ""; return } setFile(next) }} /></FieldGroup><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={saving}><HandCoins data-icon="inline-start" /> {saving ? "Guardando..." : "Registrar abono"}</Button></DialogFooter></DialogContent></Dialog>
}
