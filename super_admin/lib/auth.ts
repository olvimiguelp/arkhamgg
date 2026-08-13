// Obtiene el usuario actual de la sesión
export async function getCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      console.error('Failed to fetch current user:', response.statusText)
      return null
    }

    const user = await response.json()
    return user
  } catch (error) {
    console.error('Error fetching current user:', error)
    return null
  }
}

// Verifica si el usuario actual es super_admin
export async function isSuperAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    return user?.role === 'super_admin'
  } catch (error) {
    console.error('Error checking super_admin status:', error)
    return false
  }
}

// Obtiene el token de la sesión (si existe)
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  
  // Intenta obtener del localStorage
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
}

// Guarda el token en la sesión
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('auth_token', token)
}

// Limpia la sesión
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth_token')
  sessionStorage.removeItem('auth_token')
}
