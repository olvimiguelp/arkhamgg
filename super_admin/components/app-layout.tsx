"use client"

import { ReactNode, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Sidebar } from "./sidebar"
import { Menu, X, Building2, Bell, Search, LogOut } from "lucide-react"
import { useSidebar } from "../lib/sidebar-context"
import { useStore } from "@/components/store-context"

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { collapsed } = useSidebar()
  const { currentUser, logout } = useStore()
  const navigate = useNavigate()

  const displayName = currentUser?.name || "Super Admin"
  const displayEmail = currentUser?.email || "admin@saasadmin.com"
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-full items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="font-bold text-foreground">SaaSAdmin</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl hover:bg-muted text-foreground transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      <div
        className={`lg:hidden fixed top-16 left-0 z-50 h-[calc(100vh-4rem)] w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800 transform transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>

      {/* Main content */}
      <main className={`pt-16 lg:pt-0 transition-all duration-300 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        {/* Desktop top bar */}
        <div className="hidden lg:flex h-16 items-center justify-between border-b border-border px-8 bg-card/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-80 pl-10 pr-4 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold text-sm">
                {initials}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{displayEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                className="ml-2 p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
