"use client"

import { ReactNode, useEffect, useState } from "react"
import { useAuth } from "../lib/auth-context"
import { useRouter } from "../lib/router"

interface SuperAdminGuardProps {
  children: ReactNode
  fallback?: ReactNode
  allowAdmin?: boolean
}

export function SuperAdminGuard({ children, fallback, allowAdmin = true }: SuperAdminGuardProps) {
  const { isSuperAdmin, loading, user } = useAuth()
  const { push } = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!loading) {
      const isAdmin = (user as any)?.tenantRole === 'admin' || user?.role === 'admin'
      if (!(isSuperAdmin || (allowAdmin && isAdmin))) {
        // Redirige si no es super_admin ni admin (cuando se permite admin)
        push('/login')
      }
      setIsChecking(false)
    }
  }, [loading, isSuperAdmin, push])

  if (loading || isChecking) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  const isAdmin = (user as any)?.tenantRole === 'admin' || user?.role === 'admin'

  if (!(isSuperAdmin || (allowAdmin && isAdmin))) {
    return (
      fallback || (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-500 mb-2">Acceso Denegado</h1>
            <p className="text-muted-foreground">No tienes permisos para acceder a esta sección.</p>
          </div>
        </div>
      )
    )
  }

  return <>{children}</>
}
