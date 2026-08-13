import DashboardPage from "../(dashboard)/page";
import DashboardLayout from "../(dashboard)/layout";
import AdministradoresPage from "../(dashboard)/administradores/page";
import SuscripcionesPage from "../(dashboard)/suscripciones/page";
import MensajesPage from "../(dashboard)/mensajes/page";
import BrandingPage from "../(dashboard)/branding/page";
import FacturacionPage from "../(dashboard)/facturacion/page";
import ReportesPage from "../(dashboard)/reportes/page";
import ImportarClientesPage from "../importar-clientes/page";
import { Navigate, Route, Routes } from "react-router-dom";

export default function SuperAdminPage() {
  return (
    <DashboardLayout>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="administradores" element={<AdministradoresPage />} />
        <Route path="suscripciones" element={<SuscripcionesPage />} />
        <Route path="mensajes" element={<MensajesPage />} />
        <Route path="branding" element={<BrandingPage />} />
        <Route path="facturacion" element={<FacturacionPage />} />
        <Route path="reportes" element={<ReportesPage />} />
        <Route path="importar-clientes" element={<ImportarClientesPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
