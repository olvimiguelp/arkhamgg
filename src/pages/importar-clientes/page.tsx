"use client"

import { useRef, useState, useMemo } from "react"
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, Search, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
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
import { Input } from "@/components/ui/input"
import { useStore } from "@/components/store-context"
import { toast } from "sonner"
import { parseCSV, parseSQL, type CustomerImportData } from "@/lib/import-customers"

export default function ImportCustomersPage() {
  const navigate = useNavigate()
  const { addCustomer, currentUser, customers, employees } = useStore()

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedEntityType, setSelectedEntityType] = useState<"customer" | "employee" | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<CustomerImportData[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [showCustomerSelector, setShowCustomerSelector] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [importResults, setImportResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Combinar y filtrar clientes y empleados
  const filteredResults = useMemo(() => {
    const query = searchQuery.toLowerCase()
    
    const filteredCustomers = customers.filter((customer) =>
      customer.name.toLowerCase().includes(query) ||
      customer.cedula?.toLowerCase().includes(query) ||
      customer.phone?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query)
    )

    const filteredEmployees = employees.filter((employee) =>
      employee.name.toLowerCase().includes(query) ||
      employee.cedula?.toLowerCase().includes(query) ||
      employee.phone?.toLowerCase().includes(query) ||
      employee.email?.toLowerCase().includes(query)
    )

    return [
      ...filteredCustomers.map((c) => ({ ...c, type: "customer" as const })),
      ...filteredEmployees.map((e) => ({ ...e, type: "employee" as const })),
    ]
  }, [customers, employees, searchQuery])

  const selectedEntity =
    selectedEntityType === "customer"
      ? customers.find((c) => c.id === selectedEntityId)
      : selectedEntityType === "employee"
        ? employees.find((e) => e.id === selectedEntityId)
        : null

  const handleSelectEntity = (entityId: string, entityType: "customer" | "employee") => {
    setSelectedEntityId(entityId)
    setSelectedEntityType(entityType)
    setShowCustomerSelector(false)
    setSearchQuery("")
    const entity = entityType === "customer" 
      ? customers.find((c) => c.id === entityId)
      : employees.find((e) => e.id === entityId)
    toast.success(`${entityType === "customer" ? "Cliente" : "Empleado"} seleccionado: ${entity?.name}`)
  }

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
    setSelectedItems(new Set())
    setImportResults(null)
  }

  const handleParse = async () => {
    if (!selectedFile) return

    setIsLoading(true)

    try {
      const content = await selectedFile.text()
      const ext = selectedFile.name.split(".").pop()?.toLowerCase()

      let data: CustomerImportData[] = []
      if (ext === "csv") data = parseCSV(content)
      if (ext === "sql") data = parseSQL(content)

      if (data.length === 0) {
        toast.error("No se encontraron datos validos en el archivo")
        return
      }

      setParsedData(data)
      setSelectedItems(new Set(data.map((_, index) => index)))
      setShowPreview(true)
      toast.success(`Se encontraron ${data.length} registros en el archivo`)
    } catch (error) {
      toast.error(`Error al procesar el archivo: ${String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!selectedEntityId || !selectedEntity || !selectedEntityType) {
      toast.error("Debes seleccionar un cliente o empleado primero")
      return
    }

    const itemsToImport = parsedData.filter((_, index) => selectedItems.has(index))

    if (itemsToImport.length === 0) {
      toast.error("Selecciona al menos un registro para importar")
      return
    }

    setIsLoading(true)
    setImportProgress(0)

    try {
      let successCount = 0
      let failedCount = 0
      const errors: string[] = []
      const entityLabel = selectedEntityType === "customer" ? "Cliente" : "Empleado"

      for (let i = 0; i < itemsToImport.length; i++) {
        const item = itemsToImport[i]

        try {
          // Aquí vinculas los datos al cliente/empleado por su ID
          const createdId = await addCustomer({
            name: item.name,
            cedula: item.cedula || "",
            phone: item.phone || "",
            email: item.email || "",
            address: item.address || "",
            status: (item.status || "En proceso") as "En proceso" | "Finalizado",
            creditDevice: item.creditDevice || "",
            notes: `${item.notes || ""} [Importado para ${entityLabel}: ${selectedEntity.name}]`,
            debt: item.debt || 0,
            totalPurchases: item.totalPurchases || 0,
            creditBalance: item.creditBalance || 0,
            creditLimit: item.creditLimit || 0,
          })

          if (createdId) {
            successCount++
          } else {
            failedCount++
            errors.push(`No se pudo importar "${item.name}"`)
          }
        } catch (error) {
          failedCount++
          errors.push(`Error al importar "${item.name}": ${String(error)}`)
        }

        setImportProgress(Math.round(((i + 1) / itemsToImport.length) * 100))
      }

      setImportResults({
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 5),
      })

      setShowPreview(false)
      setShowResults(true)

      if (failedCount === 0) {
        toast.success(`${successCount} registros importados exitosamente para ${selectedEntity.name}`)
      } else {
        toast.warning(`Se importaron ${successCount} registros, pero ${failedCount} fallaron`)
      }

      setSelectedFile(null)
      setParsedData([])
      setSelectedItems(new Set())
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
    setSelectedItems(new Set())
    setImportResults(null)
    setShowPreview(false)
    setShowResults(false)
    setImportProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleChangeEntity = () => {
    setShowCustomerSelector(true)
    setSelectedEntityId(null)
    setSelectedEntityType(null)
    handleReset()
  }

  const selectedCount = selectedItems.size
  const allSelected = parsedData.length > 0 && selectedCount === parsedData.length
  const someSelected = selectedCount > 0 && !allSelected

  const toggleItemSelection = (index: number, checked: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (checked) next.add(index)
      else next.delete(index)
      return next
    })
  }

  const toggleAllSelection = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(parsedData.map((_, index) => index)))
      return
    }

    setSelectedItems(new Set())
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 flex items-center justify-center">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Acceso denegado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-red-800">Solo los administradores pueden acceder a esta página.</p>
            <Button onClick={() => navigate("/ventas")} variant="outline">
              Volver a Ventas
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Importar Información de Clientes</h1>
          <p className="mt-2 text-slate-600">
            Selecciona un cliente y carga un archivo CSV o SQL para importar su información
          </p>
        </div>

        <div className="grid gap-6">
          {/* Selector de Cliente o Empleado */}
          {showCustomerSelector && (
            <Card className="border-2 border-blue-300 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Paso 1: Selecciona un Cliente o Empleado
                </CardTitle>
                <CardDescription>Busca y selecciona el cliente o empleado para importar información</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Busca por nombre, cédula, teléfono o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <ScrollArea className="h-80 w-full rounded-lg border p-4">
                  <div className="space-y-2">
                    {filteredResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-slate-500">No se encontraron clientes o empleados</p>
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                          >
                            Limpiar búsqueda
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredResults.map((entity) => (
                        <button
                          key={`${entity.type}-${entity.id}`}
                          onClick={() => handleSelectEntity(entity.id, entity.type)}
                          className="w-full text-left rounded-md border border-slate-200 bg-white p-3 transition hover:border-blue-500 hover:bg-blue-50"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{entity.name}</p>
                              <span
                                className={`inline-flex text-xs font-semibold px-2 py-1 rounded-full ${
                                  entity.type === "customer"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {entity.type === "customer" ? "Cliente" : "Empleado"}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                              {entity.cedula && <span>Cédula: {entity.cedula}</span>}
                              {entity.phone && <span>Tel: {entity.phone}</span>}
                              {entity.email && <span>Email: {entity.email}</span>}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Entidad Seleccionada */}
          {selectedEntity && !showCustomerSelector && (
            <Card className="border-l-4 border-l-green-500 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-600">
                        {selectedEntityType === "customer" ? "Cliente" : "Empleado"} seleccionado:
                      </p>
                      <span
                        className={`inline-flex text-xs font-semibold px-2 py-1 rounded-full ${
                          selectedEntityType === "customer"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {selectedEntityType === "customer" ? "Cliente" : "Empleado"}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-slate-900">{selectedEntity.name}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      {selectedEntity.cedula && <span>Cédula: {selectedEntity.cedula}</span>}
                      {selectedEntity.phone && <span>Tel: {selectedEntity.phone}</span>}
                      {selectedEntity.email && <span>Email: {selectedEntity.email}</span>}
                    </div>
                  </div>
                  <Button
                    onClick={handleChangeEntity}
                    variant="outline"
                    size="sm"
                    className="self-start"
                  >
                    Cambiar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Carga de Archivo */}
          {selectedEntity && (
            <>
              <Card className="border-2 border-dashed border-slate-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Paso 2: Cargar Archivo
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
                      name, cedula, phone, email, address, status, creditDevice, notes, debt,
                      totalPurchases, creditBalance, creditLimit
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
            </>
          )}
        </div>
      </div>

      {/* Dialog de Vista Previa */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa de registros</DialogTitle>
            <DialogDescription>
              Selecciona los registros que quieres guardar para {selectedEntity?.name}. {selectedCount} de{" "}
              {parsedData.length} seleccionados.
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
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>
              Limpiar seleccion
            </Button>
          </div>

          <ScrollArea className="h-80 w-full rounded-lg border p-4">
            <div className="space-y-3">
              {parsedData.map((item, idx) => (
                <div
                  key={idx}
                  className={`rounded-md border p-3 text-sm transition ${
                    selectedItems.has(idx) ? "border-blue-500 bg-blue-50/40" : "border-slate-200 bg-white"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={selectedItems.has(idx)}
                      onCheckedChange={(checked) => toggleItemSelection(idx, checked === true)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.name}</p>
                      {item.phone && <p className="text-xs text-slate-600">Tel: {item.phone}</p>}
                      {item.email && <p className="text-xs text-slate-600">Email: {item.email}</p>}
                      {!!item.debt && <p className="text-xs text-red-600">Deuda: {item.debt}</p>}
                    </div>
                  </label>
                </div>
              ))}
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

      {/* Dialog de Resultados */}
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
                  <p className="text-sm font-semibold text-green-900">{importResults.success} registros importados</p>
                </div>
              </div>

              {importResults.failed > 0 && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-red-900">{importResults.failed} registros fallaron</p>
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
