"use client"

import { useLocation } from "react-router-dom"
import { BusinessProvider } from "../lib/business-context"
import { SidebarProvider } from "../lib/sidebar-context"
import { AuthProvider } from "../lib/auth-context"
import { AppLayout } from "../components/app-layout"
import { SuperAdminGuard } from "../components/super-admin-guard"

import DashboardPage from "../../src/pages/(dashboard)/page"
import AdministradoresPage from "../../src/pages/(dashboard)/administradores/page"
import SuscripcionesPage from "../../src/pages/(dashboard)/suscripciones/page"
import MensajesPage from "../../src/pages/(dashboard)/mensajes/page"
import BrandingPage from "../../src/pages/(dashboard)/branding/page"
import FacturacionPage from "../../src/pages/(dashboard)/facturacion/page"
import ReportesPage from "../../src/pages/(dashboard)/reportes/page"
import ImportarClientesPage from "./pages/importar-clientes/page"

function AppContent() {
  const { pathname } = useLocation()

  const renderPage = () => {
    switch (pathname) {
      case "/":
      case "/dashboard":
        return <DashboardPage />
      case "/dashboard/administradores":
        return <AdministradoresPage />
      case "/dashboard/suscripciones":
        return <SuscripcionesPage />
      case "/dashboard/mensajes":
        return <MensajesPage />
      case "/dashboard/branding":
        return <BrandingPage />
      case "/dashboard/facturacion":
        return <FacturacionPage />
      case "/dashboard/reportes":
        return <ReportesPage />
      case "/dashboard/importar-clientes":
        return <ImportarClientesPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <SuperAdminGuard>
      <BusinessProvider>
        <SidebarProvider>
          <AppLayout>
            {renderPage()}
          </AppLayout>
        </SidebarProvider>
      </BusinessProvider>
    </SuperAdminGuard>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
