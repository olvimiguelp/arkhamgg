"use client"

import { useLocation, useNavigate } from "react-router-dom";
import { Fragment, useEffect, useState } from "react"
import {
  ShoppingCart,
  BadgeDollarSign,
  Users,
  Tag,
  Archive,
  Warehouse,
  UserCircle,
  BarChart3,
  FileText,
  User,
  RotateCcw,
  UserCog,
  DollarSign,
  Package,
  ClipboardList,
  History,
  Wrench,
  Receipt,
  Wallet,
  Landmark,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStore } from "@/components/store-context"
import { AuthModal } from "@/components/auth-modal"
import type { Employee } from "@/components/store-context"
import { NOMBRECONFI } from "@/nombreconfi"
import { AppLogo } from "@/components/app-logo"
import { tenantCanAccessMenuItem } from "@/lib/tenant-permissions"
import { useSidebar } from "@/lib/sidebar-context"

export const MENU_ITEMS = [
  {
    id: "sales",
    label: "Ventas y Facturación",
    icon: ShoppingCart,
    to: "/ventas",
    subtitle: "Gestiona tus ventas y facturas.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "sales" as keyof Employee["permissions"],
  },
  {
    id: "wholesale-sales",
    label: "Ventas por Mayor",
    icon: BadgeDollarSign,
    to: "/ventas-por-mayor",
    subtitle: "Gestiona ventas al por mayor con precios de volumen.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "wholesaleSales" as keyof Employee["permissions"],
  },
  {
    id: "invoice-history",
    label: "Historial de Facturas",
    icon: FileText,
    to: "/historial-facturas",
    subtitle: "Ver todas las facturas emitidas.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "invoiceHistory" as keyof Employee["permissions"],
  },
  {
    id: "returns",
    label: "Devoluciones",
    icon: RotateCcw,
    to: "/devoluciones",
    subtitle: "Gestiona devoluciones de productos.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "returns" as keyof Employee["permissions"],
  },
  {
    id: "sales-group",
    label: "Ventas",
    icon: ShoppingCart,
    to: "/ventas",
    subtitle: "Ventas, facturas, clientes y ventas por mayor.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "sales" as keyof Employee["permissions"],
    permissionKeys: [
      "sales",
      "invoiceHistory",
      "returns",
      "customers",
      "importCustomers",
      "clienteAlmacen",
      "almacenInvoiceHistory",
      "wholesaleSales",
      "wholesaleDiscounts",
    ] as const,
  },
  {
    id: "repairs",
    label: "Reparaciones / Taller",
    icon: Wrench,
    to: "/reparaciones",
    subtitle: "Recepción de equipos, diagnóstico, presupuesto y facturación.",
    actionLabel: "Registrar Recepción",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "repairs" as keyof Employee["permissions"],
  },
  {
    id: "exclusive-queue",
    label: "Cola Exclusiva",
    icon: ClipboardList,
    to: "/cola-exclusiva",
    subtitle: "Guarda pre-facturas pendientes de cobro.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "queueExclusive" as keyof Employee["permissions"],
  },
  {
    id: "services-group",
    label: "Servicios",
    icon: Wrench,
    to: "/reparaciones",
    subtitle: "Reparaciones y cola exclusiva.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "repairs" as keyof Employee["permissions"],
    permissionKeys: ["repairs", "queueExclusive"] as const,
  },
  {
    id: "products",
    label: "Productos",
    icon: Tag,
    to: "/productos",
    subtitle: "Gestiona el inventario completo: teléfonos, accesorios y repuestos.",
    actionLabel: "Nuevo Producto",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "products" as keyof Employee["permissions"],
  },
  {
    id: "warehouse",
    label: "Almacen",
    icon: Archive,
    to: "/almacen",
    subtitle: "Organiza las cajas del almacen y los componentes guardados en cada una.",
    actionLabel: "Agregar Producto",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "almacen" as keyof Employee["permissions"],
  },
  {
    id: "warehouse-invoice-history",
    label: "Historial Almacen",
    icon: FileText,
    to: "/historial-facturas-almacen",
    subtitle: "Ver solo facturas de productos de almacen.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "almacenInvoiceHistory" as keyof Employee["permissions"],
  },
  {
    id: "inventory-group",
    label: "Inventario",
    icon: Package,
    to: "/productos",
    subtitle: "Productos, almacen y proveedores.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "products" as keyof Employee["permissions"],
    permissionKeys: ["products", "almacen", "suppliers"] as const,
  },

  {
    id: "customers",
    label: "Clientes",
    icon: UserCircle,
    to: "/clientes",
    subtitle: "Gestión de clientes y créditos.",
    actionLabel: "Nuevo Cliente",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "customers" as keyof Employee["permissions"],
  },
  {
    id: "import-customers",
    label: "Importar Clientes",
    icon: Users,
    to: "/importar-clientes",
    subtitle: "Importa clientes desde archivos CSV o SQL.",
    actionLabel: null,
    allowedRoles: ["admin"] as const,
    permissionKey: "importCustomers" as keyof Employee["permissions"],
  },
  {
    id: "almacen-customers",
    label: "Cliente Almacen",
    icon: Warehouse,
    to: "/cliente-almacen",
    subtitle: "Cuentas de credito exclusivas para productos de almacen.",
    actionLabel: "Nuevo Cliente",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "clienteAlmacen" as keyof Employee["permissions"],
  },
  {
    id: "suppliers",
    label: "Proveedores",
    icon: Users,
    to: "/proveedores",
    subtitle: "Directorio de proveedores de equipos y repuestos.",
    actionLabel: "Nuevo Proveedor",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "suppliers" as keyof Employee["permissions"],
  },
  {
    id: "purchase-invoices",
    label: "Registro de Facturas",
    icon: Receipt,
    to: "/facturas",
    subtitle: "Guarda facturas de compra, vincúlalas a productos y controla lo que debes a proveedores.",
    actionLabel: "Nueva Factura",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "purchases" as keyof Employee["permissions"],
  },
  {
    id: "finance",
    label: "Finanzas",
    icon: Landmark,
    to: "/finanzas",
    subtitle: "Cuentas por pagar y cierres de caja y almacén.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "cashClosing" as keyof Employee["permissions"],
    permissionKeys: ["purchases", "reports", "cashClosing", "almacenClosing"] as const,
  },
  {
    id: "accounts-payable",
    label: "Cuentas por Pagar",
    icon: Wallet,
    to: "/cuentas-por-pagar",
    subtitle: "Lo que el negocio debe a sus proveedores y cuándo vence.",
    actionLabel: "Nueva cuenta por pagar",
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "purchases" as keyof Employee["permissions"],
  },
  {
    id: "employees",
    label: "Empleados",
    icon: UserCog,
    to: "/empleados",
    subtitle: "Gestión de empleados y permisos.",
    actionLabel: "Nuevo Empleado",
    allowedRoles: ["admin"] as const,
    permissionKey: "employees" as keyof Employee["permissions"],
  },
  {
    id: "reports",
    label: "Reportes",
    icon: BarChart3,
    to: "/reportes",
    subtitle: "Ver ganancias y estadísticas.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "reports" as keyof Employee["permissions"],
  },
  {
    id: "cash-closing",
    label: "Cierre de Caja",
    icon: DollarSign,
    to: "/cierre-de-caja",
    subtitle: "Cerrar caja y ver arqueos.",
    actionLabel: null,
    allowedRoles: ["admin"] as const,
    permissionKey: "cashClosing" as keyof Employee["permissions"],
  },
  {
    id: "warehouse-closing",
    label: "Cierre de Almacen",
    icon: Archive,
    to: "/cierre-de-almacen",
    subtitle: "Cierre diario del inventario de almacen.",
    actionLabel: null,
    allowedRoles: ["admin", "employee"] as const,
    permissionKey: "almacenClosing" as keyof Employee["permissions"],
  },
]

interface SidebarProps {
  className?: string
  onItemClick?: () => void
}

export function Sidebar({ className, onItemClick }: SidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [salesExpanded, setSalesExpanded] = useState(
    [
      "/ventas",
      "/historial-facturas",
      "/devoluciones",
      "/clientes",
      "/importar-clientes",
      "/cliente-almacen",
      "/historial-facturas-almacen",
      "/ventas-por-mayor",
    ].includes(pathname),
  )
  const [servicesExpanded, setServicesExpanded] = useState(
    ["/reparaciones", "/cola-exclusiva"].includes(pathname),
  )
  const [inventoryExpanded, setInventoryExpanded] = useState(
    ["/productos", "/almacen", "/proveedores"].includes(pathname),
  )
  const [financeExpanded, setFinanceExpanded] = useState(
    pathname === "/finanzas" || ["/cuentas-por-pagar", "/cierre-de-caja", "/cierre-de-almacen"].includes(pathname),
  )
  const { currentUser, login, employees } = useStore()
  const { collapsed, toggleCollapsed } = useSidebar()

  const navigate = useNavigate()

  const handleLogin = async (role: "admin" | "employee", password: string) => {
    const email = role === "admin" ? "admin@doblete.com" : "empleado@doblete.com"
    const result = await login(email, password)
    return result.success
  }

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent("request-turn-logout"))
    // TurnSessionGate registra el cierre y luego ejecuta logout.
    // Si no hay turno activo, el evento también cierra la sesión inmediatamente.
  }

  const filteredMenuItems = MENU_ITEMS.filter((item) => tenantCanAccessMenuItem(currentUser, employees, item))
  const salesItemIds = new Set([
    "sales",
    "invoice-history",
    "returns",
    "customers",
    "import-customers",
    "almacen-customers",
    "warehouse-invoice-history",
    "wholesale-sales",
  ])
  const servicesItemIds = new Set(["repairs", "exclusive-queue"])
  const inventoryItemIds = new Set(["products", "warehouse", "suppliers"])
  const financeItemIds = new Set([
    "purchase-invoices",
    "accounts-payable",
    "reports",
    "cash-closing",
    "warehouse-closing",
  ])
  const visibleMenuItems = filteredMenuItems.filter(
    (item) =>
      !salesItemIds.has(item.id) &&
      !servicesItemIds.has(item.id) &&
      !inventoryItemIds.has(item.id) &&
      !financeItemIds.has(item.id),
  )
  const financeChildren = filteredMenuItems.filter((item) => financeItemIds.has(item.id))
  const salesChildren = filteredMenuItems.filter((item) => salesItemIds.has(item.id))
  const servicesChildren = filteredMenuItems.filter((item) => servicesItemIds.has(item.id))
  const inventoryChildren = filteredMenuItems.filter((item) => inventoryItemIds.has(item.id))

  useEffect(() => {
    if (financeItemIds.has(filteredMenuItems.find((item) => item.to === pathname)?.id || "")) {
      setFinanceExpanded(true)
    }
  }, [pathname])

  useEffect(() => {
    if (salesItemIds.has(filteredMenuItems.find((item) => item.to === pathname)?.id || "")) {
      setSalesExpanded(true)
    }
  }, [pathname])

  useEffect(() => {
    if (servicesItemIds.has(filteredMenuItems.find((item) => item.to === pathname)?.id || "")) {
      setServicesExpanded(true)
    }
  }, [pathname])

  useEffect(() => {
    if (inventoryItemIds.has(filteredMenuItems.find((item) => item.to === pathname)?.id || "")) {
      setInventoryExpanded(true)
    }
  }, [pathname])

  return (
    <div className={cn("flex h-full flex-col gap-4 overflow-x-hidden overflow-y-auto py-4 pb-4", className)}>
      <button
        onClick={toggleCollapsed}
        className={cn(
          "flex items-center transition-opacity hover:opacity-80",
          collapsed ? "w-full justify-center" : "gap-2 px-3 py-2 md:px-6"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-[#fbbf24]/30 bg-[#1e293b]">
          <AppLogo className="h-8 w-8" />
        </div>
        {!collapsed && <span className="truncate text-left text-lg font-bold text-[#f1f5f9]">{NOMBRECONFI.appName}</span>}
      </button>
      <nav className="flex flex-col gap-1 px-2">
        {visibleMenuItems.map((item) => {
          const isActive = pathname === item.to

          if (
            item.id === "finance" ||
            item.id === "sales-group" ||
            item.id === "services-group" ||
            item.id === "inventory-group"
          ) {
            const isSalesGroup = item.id === "sales-group"
            const isServicesGroup = item.id === "services-group"
            const isInventoryGroup = item.id === "inventory-group"
            const groupChildren = isSalesGroup
              ? salesChildren
              : isServicesGroup
                ? servicesChildren
                : isInventoryGroup
                  ? inventoryChildren
                  : financeChildren
            const groupExpanded = isSalesGroup
              ? salesExpanded
              : isServicesGroup
                ? servicesExpanded
                : isInventoryGroup
                  ? inventoryExpanded
                  : financeExpanded
            const isGroupActive = pathname === item.to || groupChildren.some((child) => child.to === pathname)

            return (
              <Fragment key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  title={collapsed ? item.label : undefined}
                  onClick={() => {
                    if (collapsed) {
                      navigate(item.to)
                    } else {
                      if (isSalesGroup) {
                        setSalesExpanded((expanded) => !expanded)
                      } else if (isServicesGroup) {
                        setServicesExpanded((expanded) => !expanded)
                      } else if (isInventoryGroup) {
                        setInventoryExpanded((expanded) => !expanded)
                      } else {
                        setFinanceExpanded((expanded) => !expanded)
                      }
                    }
                  }}
                  className={cn(
                    "w-full min-w-0",
                    collapsed ? "justify-center" : "justify-start gap-2",
                    isGroupActive
                      ? "bg-[#fbbf24] text-[#1e293b] hover:bg-[#fbbf24]/90"
                      : "text-[#f1f5f9] hover:bg-[#f1f5f9]/10 hover:text-[#f1f5f9]",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                  {!collapsed && (groupExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0" />
                    : <ChevronRight className="h-4 w-4 shrink-0" />)}
                </Button>
                {!collapsed && groupExpanded && (
                  <div className="ml-4 flex flex-col gap-1 border-l border-[#475569] pl-2">
                    {groupChildren.map((groupItem) => {
                      const isChildActive = pathname === groupItem.to
                      return (
                        <Button
                          key={groupItem.id}
                          type="button"
                          variant="ghost"
                          onClick={() => { navigate(groupItem.to); onItemClick?.() }}
                          className={cn(
                            "w-full min-w-0 justify-start gap-2 text-sm",
                            isChildActive
                              ? "bg-[#fbbf24] text-[#1e293b] hover:bg-[#fbbf24]/90"
                              : "text-[#cbd5e1] hover:bg-[#f1f5f9]/10 hover:text-[#f1f5f9]",
                          )}
                        >
                          <groupItem.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate text-left">{groupItem.label}</span>
                        </Button>
                      )
                    })}
                  </div>
                )}
              </Fragment>
            )
          }

          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              title={collapsed ? item.label : undefined}
              onClick={() => { navigate(item.to); onItemClick?.() }}
              className={cn(
                "w-full min-w-0",
                collapsed ? "justify-center" : "justify-start gap-2",
                isActive
                  ? "bg-[#fbbf24] text-[#1e293b] hover:bg-[#fbbf24]/90"
                  : "text-[#f1f5f9] hover:bg-[#f1f5f9]/10 hover:text-[#f1f5f9]",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate text-left">{item.label}</span>}
            </Button>
          )
        })}
      </nav>

      <div className="px-2 mt-auto border-t border-[#334155] pt-4">
        <Button
          variant="ghost"
          onClick={() => setShowAuthModal(true)}
          title={collapsed && currentUser ? currentUser.name : undefined}
          className={cn(
            "w-full min-w-0",
            collapsed ? "justify-center" : "justify-start gap-2",
            currentUser
              ? currentUser.role === "admin"
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-blue-500 hover:bg-blue-500/10"
              : "text-[#f1f5f9] hover:bg-[#f1f5f9]/10",
          )}
        >
          <User className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate text-left">{currentUser ? currentUser.name : "Iniciar Sesión"}</span>}
        </Button>
      </div>

      <AuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        onLogin={handleLogin}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    </div>
  )
}
