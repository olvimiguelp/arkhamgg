"use client"

import { useRef, useState } from "react"
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStore } from "@/components/store-context"
import { toast } from "sonner"
import { parseCSV, parseSQL, parseGenericCSV } from "@/lib/import-customers"

export default function ImportCustomersPage() {
  const { addCustomer, addSupplier, addProduct, addEmployee } = useStore()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<Array<Record<string, any>>>([])
  const [selectedCustomers, setSelectedCustomers] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [importResults, setImportResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
  const [targetTable, setTargetTable] = useState<
    "customers" | "suppliers" | "products" | "employees"
  >("customers")

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["csv", "sql"].includes(ext)) {
      toast.error("Solo se aceptan archivos .csv o .sql")
      return
    }

    setSelectedFile(file)
    setParsedData([])
    setSelectedCustomers(new Set())
    setImportResults(null)
  }

  const handleParse = async () => {
    if (!selectedFile) return

    setIsLoading(true)

    try {
      const content = await selectedFile.text()
      const ext = selectedFile.name.split(".").pop()?.toLowerCase()

      let data: Array<Record<string, any>> = []
      if (ext === "csv") data = parseGenericCSV(content)
      if (ext === "sql") {
        const sqlData = parseSQL(content)
        // Convertir CustomerImportData[] a registro genérico
        data = sqlData.map((c) => ({
          name: c.name,
          cedula: c.cedula,
          phone: c.phone,
          email: c.email,
          address: c.address,
          status: c.status,
          creditDevice: c.creditDevice,
          notes: c.notes,
          debt: c.debt,
          totalPurchases: c.totalPurchases,
          creditBalance: c.creditBalance,
          creditLimit: c.creditLimit,
        }))
      }

      if (data.length === 0) {
        toast.error("No se encontraron datos validos en el archivo")
        return
      }

      setParsedData(data)
      setSelectedCustomers(new Set(data.map((_, index) => index)))
      setShowPreview(true)
      toast.success(`Se encontraron ${data.length} registros en el archivo`)
    } catch (error) {
      toast.error(`Error al procesar el archivo: ${String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    const customersToImport = parsedData.filter((_, index) => selectedCustomers.has(index))

    if (customersToImport.length === 0) {
      toast.error("Selecciona al menos un cliente para importar")
      return
    }

    setIsLoading(true)
    setImportProgress(0)

    try {
      let successCount = 0
      let failedCount = 0
      const errors: string[] = []

      for (let i = 0; i < customersToImport.length; i++) {
        const customer = customersToImport[i]

        try {
          let createdId: string | undefined | null = undefined

          if (targetTable === "customers") {
            createdId = await addCustomer({
              name: customer.name,
              cedula: customer.cedula || "",
              phone: customer.phone || "",
              email: customer.email || "",
              address: customer.address || "",
              status: (customer.status || "En proceso") as "En proceso" | "Finalizado",
              creditDevice: customer.creditDevice || "",
              notes: customer.notes || "",
              debt: customer.debt || 0,
              totalPurchases: customer.totalPurchases || 0,
              creditBalance: customer.creditBalance || 0,
              creditLimit: customer.creditLimit || 0,
            })

            if (createdId) {
              successCount++
            } else {
              failedCount++
              errors.push(`No se pudo importar "${customer.name}"`)
            }
          } else if (targetTable === "suppliers") {
            // Mapear campos simples para proveedores
            await addSupplier({
              name: customer.name,
              rnc: customer.cedula || "",
              razonSocial: customer.name,
              tipoEmpresa: "",
              website: "",
              contact: customer.name,
              phone: customer.phone || "",
              email: customer.email || "",
              address: customer.address || "",
              debt: customer.debt || 0,
              totalPurchases: customer.totalPurchases || 0,
            })
            successCount++
          } else if (targetTable === "products") {
            // Mapear campos para producto con heurística
            const get = (keys: string[]) => keys.map((k) => customer[k] || customer[k.toLowerCase()]).find(Boolean)
            const sku = get(["sku", "codigo", "code"]) || `sku-${Math.random().toString(36).slice(2, 8)}`
            await addProduct({
              sku: sku,
              name: (customer.name || customer.nombre || sku) as string,
              category: (customer.category || customer.categoria || "") as string,
              boxNumber: (customer.boxNumber || customer.box_number || "") as string,
              stock: Number(customer.stock || customer.cantidad || 0),
              minStock: Number(customer.minStock || customer.min_stock || 0),
              buyPrice: Number(customer.buyPrice || customer.buy_price || 0),
              sellPrice: Number(customer.sellPrice || customer.sell_price || 0),
              supplier: (customer.supplier || "") as string,
              capacity: (customer.capacity || "") as string,
              imei: (customer.imei || "") as string,
            })
            successCount++
          } else if (targetTable === "employees") {
            await addEmployee({
              name: customer.name || customer.nombre || "",
              email: customer.email || customer.correo || "",
              password: (customer.password && String(customer.password)) || "password123",
              phone: customer.phone || customer.telefono || "",
              role: (customer.role as any) || "employee",
              ownerAdminId: undefined,
              cedula: customer.cedula || "",
              address: customer.address || "",
              hireDate: customer.hireDate || new Date().toISOString().slice(0, 10),
              salary: Number(customer.salary || 0),
              status: (customer.status as any) || "active",
              permissions: customer.permissions || {},
            })
            successCount++
          }
        } catch (error) {
          failedCount++
          errors.push(`Error al importar "${customer.name}": ${String(error)}`)
        }

        setImportProgress(Math.round(((i + 1) / customersToImport.length) * 100))
      }

      setImportResults({
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 5),
      })

      setShowPreview(false)
      setShowResults(true)

      const labelMap: Record<string, string> = {
        customers: "clientes",
        suppliers: "proveedores",
        products: "productos",
        employees: "empleados",
      }
      const label = labelMap[targetTable] || "registros"

      if (failedCount === 0) {
        toast.success(`${successCount} ${label} importados exitosamente`)
      } else {
        toast.warning(`Se importaron ${successCount} ${label}, pero ${failedCount} fallaron`)
      }

      setSelectedFile(null)
      setParsedData([])
      setSelectedCustomers(new Set())
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (error) {
      toast.error(`Error durante la importacion: ${String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setParsedData([])
    setSelectedCustomers(new Set())
    setImportResults(null)
    setShowPreview(false)
    setShowResults(false)
    setImportProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const selectedCount = selectedCustomers.size
  const allSelected = parsedData.length > 0 && selectedCount === parsedData.length
  const someSelected = selectedCount > 0 && !allSelected

  const toggleCustomerSelection = (index: number, checked: boolean) => {
    setSelectedCustomers((prev) => {
      const next = new Set(prev)
      if (checked) next.add(index)
      else next.delete(index)
      return next
    })
  }

  const toggleAllSelection = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(new Set(parsedData.map((_, index) => index)))
      return
    }

    setSelectedCustomers(new Set())
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Importar Clientes</h1>
          <p className="mt-2 text-slate-600">
            Cargue un archivo CSV o SQL para importar informacion de clientes a su base de datos
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="border-2 border-dashed border-slate-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Cargar Archivo
              </CardTitle>
              <CardDescription>Soporta archivos .csv y .sql</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:bg-slate-100">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.sql"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="flex cursor-pointer flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {selectedFile?.name || "Haz clic para cargar un archivo"}
                    </p>
                    <p className="text-sm text-slate-500">o arrastra un archivo aqui</p>
                  </div>
                </label>
              </div>

              {selectedFile && selectedFile.name.split(".").pop()?.toLowerCase() === "csv" && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm font-medium">Guardar en tabla:</label>
                  <select
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value as any)}
                    className="rounded border p-1 text-sm"
                  >
                    <option value="customers">Clientes</option>
                    <option value="suppliers">Proveedores</option>
                    <option value="products">Productos</option>
                    <option value="employees">Empleados</option>
                  </select>
                </div>
              )}

              {selectedFile && (
                <div className="flex gap-2">
                  <Button onClick={handleParse} disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      "Analizar Archivo"
                    )}
                  </Button>
                  <Button onClick={handleReset} variant="outline" disabled={isLoading}>
                    Cancelar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Formato Requerido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold">CSV:</h4>
                <p className="mb-2 text-sm text-slate-600">
                  Coloque los encabezados en la primera linea. Columnas soportadas:
                </p>
                <code className="block overflow-x-auto rounded bg-slate-100 p-2 text-xs">
                  name, cedula, phone, email, address, status, creditDevice, notes, debt, totalPurchases,
                  creditBalance, creditLimit
                </code>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">SQL:</h4>
                <p className="mb-2 text-sm text-slate-600">Incluya statements INSERT INTO customers. Ejemplo:</p>
                <code className="block overflow-x-auto rounded bg-slate-100 p-2 text-xs">
                  INSERT INTO customers (...) VALUES (...);
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa de clientes</DialogTitle>
            <DialogDescription>
              Selecciona los clientes que quieres guardar. {selectedCount} de {parsedData.length} seleccionados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleAllSelection(checked === true)}
              />
              Seleccionar todos
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCustomers(new Set())}>
              Limpiar seleccion
            </Button>
          </div>

          <ScrollArea className="h-80 w-full rounded-lg border p-4">
            <div className="space-y-3">
              {parsedData.map((customer, idx) => {
                const label = customer.name || customer.sku || Object.values(customer)[0] || "Registro"
                const subPhone = customer.phone || customer.telefono || null
                const subEmail = customer.email || customer.correo || null
                const subDebt = customer.debt || customer.deuda || null

                return (
                  <div
                    key={idx}
                    className={`rounded-md border p-3 text-sm transition ${
                      selectedCustomers.has(idx) ? "border-blue-500 bg-blue-50/40" : "border-slate-200 bg-white"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={selectedCustomers.has(idx)}
                        onCheckedChange={(checked) => toggleCustomerSelection(idx, checked === true)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{label}</p>
                        {subPhone && <p className="text-xs text-slate-600">Tel: {subPhone}</p>}
                        {subEmail && <p className="text-xs text-slate-600">Email: {subEmail}</p>}
                        {!!subDebt && <p className="text-xs text-red-600">Deuda: {subDebt}</p>}
                      </div>
                    </label>
                  </div>
                )
              })}
              
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                "Importar seleccionados"
              )}
            </Button>
            <Button onClick={() => setShowPreview(false)} variant="outline" disabled={isLoading}>
              Cancelar
            </Button>
          </div>

          {isLoading && importProgress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultados de importacion</DialogTitle>
          </DialogHeader>
          {importResults && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-900">{importResults.success} clientes importados</p>
                </div>
              </div>

              {importResults.failed > 0 && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-red-900">{importResults.failed} clientes fallaron</p>
                    {importResults.errors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {importResults.errors.map((error, idx) => (
                          <p key={idx} className="text-xs text-red-700">
                            - {error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={() => setShowResults(false)} className="w-full">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
