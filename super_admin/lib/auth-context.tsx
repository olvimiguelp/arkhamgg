"use client"

import { useEffect, useState, createContext, useContext, ReactNode } from 'react'
import InitSuperAdminUser from '../components/init-super-admin-user'
import type { SuperAdmin } from './types'

interface AuthContextType {
  user: SuperAdmin | null
  loading: boolean
  error: string | null
  isSuperAdmin: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SuperAdmin | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Intenta obtener el usuario actual de la sesión
    const fetchUser = async () => {
      try {
        // Primero intenta con la API
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        })

        if (response.ok) {
          const data = await response.json()
          if (data.role === 'super_admin') {
            setUser(data)
            localStorage.setItem('current_user', JSON.stringify(data))
          } else {
            setError('User is not a super_admin')
          }
        } else {
          // Si no hay respuesta de API, intenta obtener del localStorage
          const stored = localStorage.getItem('current_user')
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              if (parsed.role === 'super_admin' || parsed.tenantRole === 'super_admin') {
                setUser(parsed)
              } else {
                setError('User is not a super_admin')
              }
            } catch {
              setError('Failed to parse stored user')
            }
          } else {
            setError('No authenticated super_admin found')
          }
        }
      } catch {
        setError('Network error fetching user')
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const logout = () => {
    setUser(null)
    localStorage.removeItem('current_user')
    localStorage.removeItem('auth_token')
    sessionStorage.removeItem('auth_token')
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  const isSuperAdmin = (user as any)?.tenantRole === 'super_admin' || user?.role === 'super_admin'

  return (
    <AuthContext.Provider value={{ user, loading, error, isSuperAdmin, logout }}>
      <InitSuperAdminUser />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
