import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

interface SaleDetailsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sale: any
}

export function SaleDetailsDialog({ open, onOpenChange, sale }: SaleDetailsDialogProps) {
    if (!sale) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Detalles de Venta #{sale.number}</DialogTitle>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead className="text-right">Precio</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sale.items && sale.items.length > 0 ? (
                                sale.items.map((item: any, index: number) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.name || item.description || "Producto sin nombre"}</TableCell>
                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                        <TableCell className="text-right">
                                            RD${formatCurrency(item.customPrice ?? item.sellPrice ?? item.price ?? 0)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            RD${formatCurrency((item.customPrice ?? item.sellPrice ?? item.price ?? 0) * item.quantity)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                        No hay detalles disponibles para esta venta.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex justify-end gap-4 mt-4 pt-4 border-t">
                    <div className="text-lg font-bold">Total: RD${formatCurrency(sale.amount)}</div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
