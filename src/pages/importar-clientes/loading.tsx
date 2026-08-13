import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
        <p className="text-slate-600">Cargando...</p>
      </div>
    </div>
  );
}
