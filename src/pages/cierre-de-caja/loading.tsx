import { Loader2 } from "lucide-react"

export default function CierreLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-slate-500">Cargando cierre de caja...</p>
      </div>
    </div>
  )
}
