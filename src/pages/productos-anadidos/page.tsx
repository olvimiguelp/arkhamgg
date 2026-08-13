"use client"

import { useState, useEffect } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import {
    ChevronLeft,
    ChevronRight,
    Search,
    Package,
} from "lucide-react"

interface ManualProduct {
    id: string
    venta_id: string
    cantidad: number
    descripcion: string
    costo_unitario: number
    precio_unitario: number
    ganancia_unitaria: number
    importe_total: number
    ganancia_total: number
    fecha: string
    usuario_id: string
    sales?: {
        invoice_number: string
    }
}

const ITEMS_PER_PAGE = 10

export default function ProductosAnadidosPage() {
    const [products, setProducts] = useState<ManualProduct[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    const supabase = createClient()

    useEffect(() => {
        fetchProducts()
    }, [currentPage, searchTerm])

    const fetchProducts = async () => {
        setIsLoading(true)
        try {
            let query = supabase
                .from("detalle_costos_ventas")
                .select("*, sales(invoice_number)", { count: "exact" }) // Select related sale
                .order("fecha", { ascending: false })

            if (searchTerm) {
                query = query.ilike("descripcion", `%${searchTerm}%`)
            }

            const from = (currentPage - 1) * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1

            const { data, error, count } = await query.range(from, to)

            if (error) throw error

            // Cast data to include the sales relation which might be returned as an array or object depending on relationship type
            // Assuming 1:1 or N:1 where detail belongs to one sale, 'sales' should be an object.
            setProducts((data as any[])?.map(item => ({
                ...item,
                sales: Array.isArray(item.sales) ? item.sales[0] : item.sales
            })) || [])
            setTotalCount(count || 0)
            setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE))
        } catch (error) {
            console.error("Error fetching manual products:", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage)
        }
    }

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="h-6 w-6 text-blue-500" />
                        Productos Añadidos Manualmente
                    </h1>
                    <p className="text-muted-foreground">
                        Historial de productos agregados manualmente en ventas confirmadas.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => fetchProducts()}>
                        Actualizar
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle>Listado de Productos</CardTitle>
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por descripción..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value)
                                    setCurrentPage(1)
                                }}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>ID Venta</TableHead> {/* New Column */}
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-center">Cant.</TableHead>
                                    <TableHead className="text-right">Costo Unit.</TableHead>
                                    <TableHead className="text-right">Precio Unit.</TableHead>
                                    <TableHead className="text-right">Importe</TableHead>
                                    <TableHead className="text-right">Ganancia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            Cargando productos...
                                        </TableCell>
                                    </TableRow>
                                ) : products.length > 0 ? (
                                    products.map((product) => (
                                        <TableRow key={product.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{new Date(product.fecha).toLocaleDateString()}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(product.fecha).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {product.sales?.invoice_number || product.venta_id.slice(0, 8)}
                                            </TableCell>
                                            <TableCell>{product.descripcion}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary">{product.cantidad}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground">
                                                {formatCurrency(product.costo_unitario)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {formatCurrency(product.precio_unitario)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-blue-600">
                                                {formatCurrency(product.importe_total)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-green-600">
                                                {formatCurrency(product.ganancia_total)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                            No se encontraron productos manuales.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex items-center justify-between space-x-2 py-4">
                        <div className="text-sm text-muted-foreground">
                            Mostrando {products.length} de {totalCount} resultados
                        </div>
                        <div className="space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1 || isLoading}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>
                            <div className="inline-flex items-center justify-center text-sm font-medium">
                                Página {currentPage} de {totalPages || 1}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages || isLoading}
                            >
                                Siguiente
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
