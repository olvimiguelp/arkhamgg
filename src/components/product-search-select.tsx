"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import type { Product } from "@/components/store-context"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function ProductSearchSelect({ products, value, onChange, placeholder = "Seleccionar producto" }: { products: Product[]; value: string; onChange: (productId: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const selected = products.find((product) => product.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{selected ? `${selected.name} · SKU ${selected.sku}` : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre o SKU..." />
          <CommandList>
            <CommandEmpty>No se encontraron productos.</CommandEmpty>
            {products.map((product) => (
              <CommandItem key={product.id} value={`${product.name} ${product.sku}`} onSelect={() => { onChange(product.id); setOpen(false) }}>
                <Check className={cn("mr-2 h-4 w-4", selected?.id === product.id ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{product.name} · SKU {product.sku} · stock {product.stock}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
