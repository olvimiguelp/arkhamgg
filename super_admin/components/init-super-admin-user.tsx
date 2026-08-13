"use client"

import { useEffect } from 'react'

/**
 * InitSuper AdminUser - Inicializa datos del super_admin desde la base de datos
 * Intenta obtener el usuario actual del endpoint de API y lo guarda en localStorage
 */
export function InitSuperAdminUser() {
  useEffect(() => {
    const initializeUser = async () => {
      try {
        // Intenta obtener el usuario desde la API
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        })

        if (response.ok) {
          const user = await response.json()
          
          // Valida que sea super_admin
          if (user.role === 'super_admin') {
            // Guarda en localStorage para acceso rápido
            localStorage.setItem('current_user', JSON.stringify(user))
            localStorage.setItem('auth_token', user.token || '')
          }
        } else {
          // Si no hay respuesta válida, intenta obtener del localStorage como fallback
          const stored = localStorage.getItem('current_user')
          if (!stored) {
            console.warn('No authenticated super_admin found')
          }
        }
      } catch (error) {
        console.error('Error initializing super_admin user:', error)
        // Fallback silencioso - el AuthProvider manejará el caso
      }
    }

    initializeUser()
  }, [])

  return null
}

export default InitSuperAdminUser
