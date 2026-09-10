"use client"

import { useState, useEffect, useCallback } from "react"
import { Phone, Mail, MapPin, Edit, Trash2, Building2, FileText, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useStore, type Supplier } from "@/components/store-context"
import { useToast } from "@/hooks/use-toast"
import { SupplierInvoices } from "@/components/supplier-invoices"

export default function SuppliersPage() {
  const { suppliers, products, addSupplier, updateSupplier, deleteSupplier, setOnDialogOpen, employees, currentUser } = useStore()
  const { toast } = useToast()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isInvestmentDialogOpen, setIsInvestmentDialogOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    rnc: "",
    razonSocial: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    defaultCreditDays: "",
    defaultLatePenaltyPercent: "0",
  })
  const employeePermissions = employees.find((employee) => employee.email === currentUser?.email)?.permissions
  const canAddSupplier = currentUser?.role === "admin" || Boolean(employeePermissions?.canAdd)
  const canEditSupplier = currentUser?.role === "admin" || Boolean(employeePermissions?.canEdit)
  const canDeleteSupplier = currentUser?.role === "admin" || Boolean(employeePermissions?.canDelete)

  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      rnc: "",
      razonSocial: "",
      contact: "",
      phone: "",
      email: "",
      address: "",
      defaultCreditDays: "",
      defaultLatePenaltyPercent: "0",
    })
    setEditingId(null)
  }, [])

  const openDialog = useCallback(() => {
    if (!canAddSupplier) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar proveedores.",
        variant: "destructive",
      })
      return
    }

    setEditingId(null)
    resetForm()
    setIsDialogOpen(true)
  }, [canAddSupplier, resetForm, toast])

  useEffect(() => {
    setOnDialogOpen(openDialog)
    return () => setOnDialogOpen(() => { })
  }, [setOnDialogOpen, openDialog])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    if (editingId && !canEditSupplier) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar proveedores.",
        variant: "destructive",
      })
      return
    }

    if (!editingId && !canAddSupplier) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar proveedores.",
        variant: "destructive",
      })
      return
    }

    if (!formData.name || !formData.rnc || !formData.contact || !formData.phone) {
      toast({
        title: "Error",
        description: "Por favor completa los campos obligatorios (Nombre, RNC, Contacto, Teléfono)",
        variant: "destructive",
      })
      return
    }

    if (editingId) {
      const updatedSupplier: Partial<Supplier> = {
        ...formData,
        defaultCreditDays: formData.defaultCreditDays === "" ? undefined : Number(formData.defaultCreditDays),
        defaultLatePenaltyPercent: Number(formData.defaultLatePenaltyPercent) || 0,
        tipoEmpresa: "",
        website: "",
      }
      updateSupplier(editingId, updatedSupplier)
      toast({
        title: "Proveedor actualizado",
        description: "Los datos del proveedor han sido actualizados",
      })
    } else {
      const newSupplier: Omit<Supplier, "id"> = {
        ...formData,
        defaultCreditDays: formData.defaultCreditDays === "" ? undefined : Number(formData.defaultCreditDays),
        defaultLatePenaltyPercent: Number(formData.defaultLatePenaltyPercent) || 0,
        tipoEmpresa: "",
        website: "",
        debt: 0,
        totalPurchases: 0,
      }
      addSupplier(newSupplier)
      toast({
        title: "Proveedor registrado",
        description: "El nuevo proveedor ha sido agregado",
      })
    }
    setIsDialogOpen(false)
    resetForm()
  }

  const handleEdit = (supplier: Supplier) => {
    if (!canEditSupplier) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar proveedores.",
        variant: "destructive",
      })
      return
    }

    setFormData({
      name: supplier.name,
      rnc: supplier.rnc,
      razonSocial: supplier.razonSocial,
      contact: supplier.contact,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      defaultCreditDays: supplier.defaultCreditDays?.toString() || "",
      defaultLatePenaltyPercent: (supplier.defaultLatePenaltyPercent ?? 0).toString(),
    })
    setEditingId(supplier.id)
    setIsDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    if (!canDeleteSupplier) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para eliminar proveedores.",
        variant: "destructive",
      })
      return
    }

    deleteSupplier(id)
    toast({
      title: "Proveedor eliminado",
      description: "El proveedor ha sido eliminado correctamente",
    })
  }

  const handleViewInvestment = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setIsInvestmentDialogOpen(true)
  }

  const getSupplierProducts = (supplierId: string) => {
    return products.filter((p) => p.supplier === supplierId)
  }

  const calculateTotalInvestment = (supplierId: string) => {
    return getSupplierProducts(supplierId).reduce((acc, p) => acc + p.buyPrice * p.stock, 0)
  }

  return (
    <div className="space-y-4 px-2 pb-4 pt-2 sm:space-y-6 sm:px-4 sm:pb-6 sm:pt-4 lg:px-6 lg:pb-6 lg:pt-6">
      {suppliers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center px-4 py-10 sm:py-12">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No hay proveedores registrados</h3>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Comienza agregando tu primer proveedor para gestionar tus compras e inventario
            </p>
            <Button onClick={openDialog} disabled={!canAddSupplier} className="w-full min-h-11 sm:w-auto">
              <Building2 className="mr-2 h-4 w-4" />
              Registrar Primer Proveedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <Card key={supplier.id} className="min-w-0 overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{supplier.name}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> RNC: {supplier.rnc}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canEditSupplier && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(supplier)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {canDeleteSupplier && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => handleDelete(supplier.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="mb-2 break-words text-sm font-medium text-muted-foreground">{supplier.razonSocial}</div>
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-words">{supplier.contact}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-words">{supplier.phone}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-words">{supplier.email}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="break-words">{supplier.address}</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full min-h-11 bg-transparent"
                  onClick={() => handleViewInvestment(supplier)}
                >
                  <DollarSign className="mr-2 h-4 w-4" /> Ver Inversión
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isInvestmentDialogOpen} onOpenChange={setIsInvestmentDialogOpen}>
        <DialogContent className="mx-2 max-h-[92vh] max-w-[95vw] overflow-y-auto sm:mx-0 sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Inversión en {selectedSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Inventario</TableHead>
                    <TableHead className="text-right">Precio Compra</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSupplier &&
                    getSupplierProducts(selectedSupplier.id).map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell className="text-right">{product.stock}</TableCell>
                        <TableCell className="text-right">RD$ {product.buyPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          RD$ {(product.buyPrice * product.stock).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  {selectedSupplier && getSupplierProducts(selectedSupplier.id).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        No hay productos registrados de este proveedor
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end">
              <div className="text-lg font-bold">
                Total Invertido: RD${" "}
                {selectedSupplier ? calculateTotalInvestment(selectedSupplier.id).toLocaleString() : "0"}
              </div>
            </div>
          </div>
          {selectedSupplier && <SupplierInvoices key={selectedSupplier.id} supplierId={selectedSupplier.id} />}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="mx-2 max-w-[95vw] sm:mx-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Proveedor" : "Registrar Proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre Comercial</Label>
                <Input
                  placeholder="Ej: Distribuidora Global"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>RNC</Label>
                <Input
                  placeholder="Ej: 1-01-12345-6"
                  value={formData.rnc}
                  onChange={(e) => handleInputChange("rnc", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Razón Social</Label>
              <Input
                placeholder="Ej: Distribuidora Global S.R.L."
                value={formData.razonSocial}
                onChange={(e) => handleInputChange("razonSocial", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Contacto Principal</Label>
                <Input
                  placeholder="Nombre del vendedor"
                  value={formData.contact}
                  onChange={(e) => handleInputChange("contact", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  placeholder="809-555-5555"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="contacto@empresa.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Dirección</Label>
              <Textarea
                placeholder="Dirección física completa"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Días de crédito por defecto</Label>
                <Input type="number" min="0" value={formData.defaultCreditDays} onChange={(e) => handleInputChange("defaultCreditDays", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>% de mora por defecto</Label>
                <Input type="number" min="0" value={formData.defaultLatePenaltyPercent} onChange={(e) => handleInputChange("defaultLatePenaltyPercent", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleSave}>
              {editingId ? "Actualizar" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
