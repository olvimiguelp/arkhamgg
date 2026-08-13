"use client"

import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  CreditCard,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  FileText,
  BarChart3,
  LogOut,
  Palette,
  UserCog,
  Bell,
  Upload,
} from "lucide-react"
import { useSidebar } from "../lib/sidebar-context"
import { useStore } from "@/components/store-context"
import { AppLogo } from "@/components/app-logo"
import { NOMBRECONFI } from "@/nombreconfi"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/administradores", label: "Administradores", icon: UserCog },
  { href: "/dashboard/suscripciones", label: "Suscripciones", icon: CreditCard },
  { href: "/dashboard/mensajes", label: "Mensajes", icon: Bell },
  { href: "/dashboard/branding", label: "Branding", icon: Palette },
  { href: "/dashboard/facturacion", label: "Facturacion", icon: FileText },
  { href: "/dashboard/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/dashboard/importar-clientes", label: "Importar Clientes", icon: Upload },
]

export function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { logout } = useStore()
  const { collapsed, toggleCollapsed } = useSidebar()

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800 transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                <AppLogo className="h-9 w-9" />
              </div>
              <div>
                <span className="font-bold text-white">{NOMBRECONFI.appName}</span>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Super Admin</span>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden border border-slate-700 bg-slate-900 mx-auto">
              <AppLogo className="h-9 w-9" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-6 overflow-y-auto">
          <p className={`text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3 ${collapsed ? "text-center" : "px-3"}`}>
            {collapsed ? "..." : "Menu Principal"}
          </p>
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600/20 to-violet-600/20 text-white shadow-lg shadow-blue-500/10"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? "text-blue-400" : ""}`} />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 p-3 space-y-2">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all"
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span>Colapsar</span>
              </>
            )}
          </button>
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
            >
              <LogOut className="h-5 w-5" />
              <span>Cerrar Sesion</span>
            </button>
          )}
          {collapsed && (
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
              title="Cerrar Sesion"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
