"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, User, Eye, EyeOff } from "lucide-react"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogin: (role: "admin" | "employee", password: string) => Promise<boolean> | boolean
  currentUser: { role: "admin" | "employee"; name: string } | null
  onLogout: () => void
}

export function AuthModal({ open, onOpenChange, onLogin, currentUser, onLogout }: AuthModalProps) {
  const [selectedRole, setSelectedRole] = useState<"admin" | "employee" | null>(null)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    if (!selectedRole) return

    setIsLoading(true)
    try {
      const success = await onLogin(selectedRole, password)
      if (success) {
        setPassword("")
        setSelectedRole(null)
        setError("")
        onOpenChange(false)
      } else {
        setError("Contraseña incorrecta")
      }
    } catch (err) {
      setError("Error al iniciar sesión")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    onLogout()
    onOpenChange(false)
  }

  const handleClose = () => {
    setSelectedRole(null)
    setPassword("")
    setError("")
    onOpenChange(false)
  }

  // Si hay usuario logueado, mostrar info y opción de cerrar sesión
  if (currentUser) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[400px] bg-[#1e293b] border-[#334155] text-white">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Sesión Activa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className={`p-4 rounded-full ${currentUser.role === "admin" ? "bg-amber-500/20" : "bg-blue-500/20"}`}>
              {currentUser.role === "admin" ? (
                <Shield className="h-12 w-12 text-amber-500" />
              ) : (
                <User className="h-12 w-12 text-blue-500" />
              )}
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{currentUser.name}</p>
              <p className="text-sm text-gray-400">{currentUser.role === "admin" ? "Administrador" : "Empleado"}</p>
            </div>
            <Button onClick={handleLogout} variant="destructive" className="w-full mt-4">
              Cerrar Sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px] bg-[#1e293b] border-[#334155] text-white">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">Iniciar Sesión</DialogTitle>
        </DialogHeader>

        {!selectedRole ? (
          <div className="flex flex-col gap-4 py-4">
            <p className="text-center text-gray-400 text-sm">Seleccione el tipo de usuario</p>
            <Button
              onClick={() => setSelectedRole("admin")}
              variant="outline"
              className="h-20 flex flex-col gap-2 bg-transparent border-[#334155] hover:bg-amber-500/10 hover:border-amber-500"
            >
              <Shield className="h-8 w-8 text-amber-500" />
              <span>Administrador</span>
            </Button>
            <Button
              onClick={() => setSelectedRole("employee")}
              variant="outline"
              className="h-20 flex flex-col gap-2 bg-transparent border-[#334155] hover:bg-blue-500/10 hover:border-blue-500"
            >
              <User className="h-8 w-8 text-blue-500" />
              <span>Empleado</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              {selectedRole === "admin" ? (
                <Shield className="h-6 w-6 text-amber-500" />
              ) : (
                <User className="h-6 w-6 text-blue-500" />
              )}
              <span className="text-lg">{selectedRole === "admin" ? "Administrador" : "Empleado"}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError("")
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="Ingrese la contraseña"
                  className="bg-[#0f172a] border-[#334155] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => {
                  setSelectedRole(null)
                  setPassword("")
                  setError("")
                }}
                variant="outline"
                className="flex-1 bg-transparent border-[#334155]"
              >
                Volver
              </Button>
              <Button onClick={handleLogin} className="flex-1 bg-[#fbbf24] text-[#1e293b] hover:bg-[#fbbf24]/90">
                Ingresar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
