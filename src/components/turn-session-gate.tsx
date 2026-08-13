import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/components/store-context"
import { createClient } from "@/lib/supabase/client"

type ActiveSession = {
  id: string
  employee_id: string
  employee_name: string
  opening_cash: number
  opening_cash_confirmed: boolean
}

export function TurnSessionGate() {
  const { currentUser, isAuthenticated, logout } = useStore()
  const { toast } = useToast()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [isReady, setIsReady] = useState(false)

  const loadActiveSession = useCallback(async () => {
    if (!currentUser || !isAuthenticated) {
      setSession(null)
      setIsReady(true)
      return
    }

    setIsReady(false)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("turn_sessions")
      .select("id, employee_id, employee_name, opening_cash, opening_cash_confirmed")
      .eq("owner_admin_id", currentUser.adminId)
      .eq("employee_id", currentUser.id)
      .eq("date", new Date().toISOString().split("T")[0])
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("Error loading active turn:", error)
      setIsReady(true)
      return
    }

    const active = data as ActiveSession | null
    if (active && !active.opening_cash_confirmed) {
      const { error: confirmError } = await supabase
        .from("turn_sessions")
        .update({ opening_cash: 0, opening_cash_confirmed: true })
        .eq("id", active.id)

      if (confirmError) {
        console.error("Error confirming existing turn session:", confirmError)
        setSession(active)
        setIsReady(true)
        return
      }

      setSession({ ...active, opening_cash: 0, opening_cash_confirmed: true })
      setIsReady(true)
      return
    }

    setSession(active)
    setIsReady(true)
  }, [currentUser?.id, currentUser?.adminId, isAuthenticated])

  const autoOpenSession = useCallback(async () => {
    if (!currentUser || session || !isAuthenticated) return

    try {
      const supabase = createClient()
      const payload = {
        owner_admin_id: currentUser.adminId,
        employee_id: currentUser.id,
        employee_name: currentUser.name,
        date: new Date().toISOString().split("T")[0],
        opened_at: new Date().toISOString(),
        status: "open",
        opening_cash: 0,
        opening_cash_confirmed: true,
      }

      const { data, error } = await supabase
        .from("turn_sessions")
        .insert(payload)
        .select("id, employee_id, employee_name, opening_cash, opening_cash_confirmed")
        .single()

      if (error) throw error

      setSession(data as ActiveSession)
      toast({ title: "Turno abierto", description: "El turno se registró automáticamente al iniciar sesión." })
    } catch (error) {
      console.error("Error opening turn automatically:", error)
      toast({ title: "No se pudo abrir el turno", description: "Ocurrió un error al registrar el turno automáticamente.", variant: "destructive" })
    }
  }, [currentUser, session, isAuthenticated, toast])

  useEffect(() => {
    void loadActiveSession()
  }, [loadActiveSession])

  useEffect(() => {
    if (!isReady) return
    void autoOpenSession()
  }, [autoOpenSession, isReady])

  useEffect(() => {
    const handleLogoutRequest = () => {
      if (!isReady) return
      logout()
    }

    window.addEventListener("request-turn-logout", handleLogoutRequest)

    return () => {
      window.removeEventListener("request-turn-logout", handleLogoutRequest)
    }
  }, [isReady, logout])

  if (!isAuthenticated) return null
  return null
}
