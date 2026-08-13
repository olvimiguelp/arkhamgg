import type React from "react"
import { useState } from "react"
import { AlertCircle, Wifi, WifiOff, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { runNetworkDiagnostics, getNetworkStatus } from "@/lib/network-diagnostics"

interface NetworkDiagnosticsProps {
  supabaseClient: any
  projectUrl?: string
  onClose?: () => void
}

export function NetworkDiagnosticsDialog({
  supabaseClient,
  projectUrl = "https://pqcgzkvnfvefzettyxkg.supabase.co",
  onClose,
}: NetworkDiagnosticsProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof runNetworkDiagnostics>> | null
  >(null)

  const runDiagnostics = async () => {
    setIsRunning(true)
    try {
      const diagnostics = await runNetworkDiagnostics(supabaseClient, projectUrl)
      setResults(diagnostics)
    } catch (err) {
      console.error("Diagnostics error:", err)
    } finally {
      setIsRunning(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="w-6 h-6 text-green-500" />
      case "network-issue":
        return <WifiOff className="w-6 h-6 text-red-500" />
      case "dns-issue":
        return <Wifi className="w-6 h-6 text-orange-500" />
      default:
        return <AlertCircle className="w-6 h-6 text-yellow-500" />
    }
  }

  const networkStatus = getNetworkStatus()

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="w-5 h-5" />
          Diagnóstico de Red
        </CardTitle>
        <CardDescription>
          Verifica problemas de conexión a Supabase desde tu red
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Current Network Status */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div className="font-medium text-sm">Estado Actual:</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Conexión: </span>
              <span className="font-medium">
                {networkStatus.isOnline ? "✅ En línea" : "❌ Sin conexión"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Tipo: </span>
              <span className="font-medium">{networkStatus.effectiveType || "desconocido"}</span>
            </div>
            {networkStatus.rtt !== undefined && (
              <div>
                <span className="text-gray-600">RTT: </span>
                <span className="font-medium">{networkStatus.rtt}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Run Diagnostics Button */}
        <Button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="w-full"
          size="lg"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ejecutando diagnóstico...
            </>
          ) : (
            "Ejecutar Diagnóstico Completo"
          )}
        </Button>

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {/* Status Alert */}
            <Alert
              variant={
                results.status === "connected"
                  ? "default"
                  : results.status === "dns-issue"
                    ? "destructive"
                    : "destructive"
              }
            >
              <div className="flex items-start gap-2">
                {getStatusIcon(results.status)}
                <div className="flex-1">
                  <AlertTitle className="mb-2">
                    {results.status === "connected"
                      ? "✅ Conectado"
                      : results.status === "dns-issue"
                        ? "⚠️ Problema de DNS"
                        : "❌ Problema de Conexión"}
                  </AlertTitle>
                  <AlertDescription>
                    {results.status === "connected"
                      ? "Tu conexión a Supabase funciona correctamente"
                      : results.status === "dns-issue"
                        ? "Tu red no puede resolver el dominio de Supabase"
                        : "No hay conexión a internet"}
                  </AlertDescription>
                </div>
              </div>
            </Alert>

            {/* Detailed Tests */}
            <div className="space-y-3">
              <div className="font-medium">Resultados Detallados:</div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {results.details.internetConnectivity.hasInternet ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm">
                    Internet:{" "}
                    {results.details.internetConnectivity.hasInternet
                      ? `✅ Conectado (${results.details.internetConnectivity.latency}ms)`
                      : "❌ Sin conexión"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {results.details.supabaseDNS.canResolve ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm">
                    DNS Supabase:{" "}
                    {results.details.supabaseDNS.canResolve
                      ? "✅ Resolvible"
                      : `❌ ${results.details.supabaseDNS.error}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {results.details.supabaseOperations.canConnect ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm">
                    API Supabase:{" "}
                    {results.details.supabaseOperations.canConnect
                      ? "✅ Conectado"
                      : "❌ No accesible"}
                  </span>
                </div>
              </div>
            </div>

            {/* Suggestions */}
            {results.suggestions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="font-medium text-blue-900">📝 Sugerencias:</div>
                <ul className="text-sm text-blue-800 space-y-1">
                  {results.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="whitespace-pre-wrap">
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Quick Solutions */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <div className="font-medium text-amber-900">⚡ Soluciones Rápidas:</div>
          <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
            <li>Cambia DNS del router a <code className="bg-white px-2 py-1 rounded">1.1.1.1</code> (Cloudflare)</li>
            <li>Si el problema persiste, usa temporalmente la red "buena"</li>
            <li>Reinicia el router WiFi</li>
            <li>Limpia caché del navegador (Ctrl+Shift+Del)</li>
            <li>Contacta a tu ISP si la red sigue sin poder conectar a Supabase</li>
          </ol>
        </div>

        {/* Close Button */}
        {onClose && (
          <Button variant="outline" onClick={onClose} className="w-full">
            Cerrar
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
