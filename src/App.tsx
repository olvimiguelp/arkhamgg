import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";

const Ventas = lazy(() => import("./pages/ventas/page"));
const VentasPorMayor = lazy(() => import("./pages/ventas-por-mayor/page"));
const Productos = lazy(() => import("./pages/productos/page"));
const Clientes = lazy(() => import("./pages/clientes/page"));
const ClienteAlmacen = lazy(() => import("./pages/cliente-almacen/page"));
const Proveedores = lazy(() => import("./pages/proveedores/page"));
const Facturas = lazy(() => import("./pages/facturas/page"));
const CuentasPorPagar = lazy(() => import("./pages/cuentas-por-pagar/page"));
const Finanzas = lazy(() => import("./pages/finanzas/page"));
const Login = lazy(() => import("./pages/login/page"));
const Bloqueo = lazy(() => import("./pages/bloqueo/page"));
const SuscripcionVencida = lazy(() => import("./pages/suscripcion-vencida/page"));
const Reportes = lazy(() => import("./pages/reportes/page"));
const Devoluciones = lazy(() => import("./pages/devoluciones/page"));
const Empleados = lazy(() => import("./pages/empleados/page"));
const HistorialFacturas = lazy(() => import("./pages/historial-facturas/page"));
const HistorialFacturasAlmacen = lazy(() => import("./pages/historial-facturas-almacen/page"));
const CierreDeCaja = lazy(() => import("./pages/cierre-de-caja/page"));
const CierreDeAlmacen = lazy(() => import("./pages/cierre-de-almacen/page"));
const Reparaciones = lazy(() => import("./pages/reparaciones/page"));
const ColaExclusiva = lazy(() => import("./pages/cola-exclusiva/page"));
const Almacen = lazy(() => import("./pages/almacen/page"));
const ImportarClientesPage = lazy(() => import("./pages/importar-clientes/page"));
const InformeCierreTurno = lazy(() => import("./pages/informe-cierre-turno/page"));
const SuperAdminDashboard = lazy(() => import("./pages/super-admin/page"));
import { Layout } from "@/components/Layout";
import { StoreProvider } from "@/components/store-context";
import { useStore } from "@/components/store-context";
import { SidebarProvider } from "@/lib/sidebar-context";
import { useEnterNavigation } from "@/hooks/use-enter-navigation";
import { NOMBRECONFI } from "@/nombreconfi";

const queryClient = new QueryClient();
// Electron carga la aplicación con file:// y necesita hashes. En web usamos URLs
// normales para evitar que herramientas externas interpreten "#/ruta" como CSS.
const AppRouter = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

const NotFound = () => <div style={{ padding: 24 }}>Página no encontrada</div>;

const DashboardRedirect = () => {
  const { isAuthenticated, currentUser } = useStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const fallbackPath = currentUser?.role === "super_admin"
    ? "/dashboard"
    : currentUser?.role === "admin"
      ? "/empleados"
      : "/bloqueo";
  return <Navigate to={fallbackPath} replace />;
};

const PageLoading = () => (
  <div className="flex min-h-[40vh] items-center justify-center bg-background text-muted-foreground">
    <Loader2 className="h-8 w-8 animate-spin" />
  </div>
);

const App = () => {
  useEnterNavigation();
  useEffect(() => {
    document.title = NOMBRECONFI.appName;
    const author = document.querySelector('meta[name="author"]');
    if (author) author.setAttribute("content", NOMBRECONFI.appName);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", NOMBRECONFI.appName);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRouter>
          <StoreProvider>
            <Toaster />
            <Sonner />
            <SidebarProvider>
                <Routes>
              {/* Rutas públicas (sin Layout) */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/bloqueo" element={<Suspense fallback={<PageLoading />}><Bloqueo /></Suspense>} />
              <Route path="/login" element={<Suspense fallback={<PageLoading />}><Login /></Suspense>} />
              <Route path="/suscripcion-vencida" element={<Suspense fallback={<PageLoading />}><SuscripcionVencida /></Suspense>} />
              <Route path="/dashboard/*" element={
                <Suspense fallback={<PageLoading />}>
                  <SuperAdminDashboard />
                </Suspense>
              } />
              <Route path="/importar-clientes" element={<Suspense fallback={<PageLoading />}><ImportarClientesPage /></Suspense>} />

              {/* Rutas protegidas (con Layout) */}
              <Route
                path="/*"
                element={
                  <Layout>
                    <Suspense fallback={<PageLoading />}>
                    <Routes>
                      {/* Redirigir raíz a la página de ventas */}
                      <Route path="/" element={<Navigate to="/login" replace />} />

                      {/* Rutas en español */}
                      <Route path="/ventas" element={<Ventas />} />
                      <Route path="/ventas-por-mayor" element={<VentasPorMayor />} />
                      <Route path="/ventas-mayorista" element={<Navigate to="/ventas-por-mayor" replace />} />
                      <Route path="/devoluciones" element={<Devoluciones />} />
                      <Route path="/empleados" element={<Empleados />} />
                      <Route path="/productos" element={<Productos />} />
                      <Route path="/almacen" element={<Almacen />} />
                      <Route path="/clientes" element={<Clientes />} />
                      <Route path="/cliente-almacen" element={<ClienteAlmacen />} />
                      <Route path="/proveedores" element={<Proveedores />} />
                      <Route path="/facturas" element={<Facturas />} />
                      <Route path="/finanzas" element={<Finanzas />} />
                      <Route path="/cuentas-por-pagar" element={<CuentasPorPagar />} />
                      <Route path="/cierre-de-caja" element={<CierreDeCaja />} />
                      <Route path="/informe-cierre-turno" element={<InformeCierreTurno />} />
                      <Route path="/cierre-de-almacen" element={<CierreDeAlmacen />} />
                      <Route path="/reportes" element={<Reportes />} />
                      <Route path="/historial-facturas" element={<HistorialFacturas />} />
                      <Route path="/historial-facturas-almacen" element={<HistorialFacturasAlmacen />} />
                      <Route path="/reparaciones" element={<Reparaciones />} />
                      <Route path="/cola-exclusiva" element={<ColaExclusiva />} />
                      <Route path="/cola" element={<Navigate to="/reparaciones" replace />} />

                      {/* Rutas alias en inglés */}
                      <Route path="/products" element={<Productos />} />
                      <Route path="/clients" element={<Clientes />} />
                      <Route path="/suppliers" element={<Proveedores />} />
                      <Route path="/reports" element={<Reportes />} />
                      <Route path="/repairs" element={<Reparaciones />} />
                      <Route path="/queue" element={<ColaExclusiva />} />

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </Suspense>
                  </Layout>
                }
              />
                </Routes>
            </SidebarProvider>
          </StoreProvider>
        </AppRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
