import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "@/components/store-context";
import { Sidebar, MENU_ITEMS } from "@/components/sidebar";
import { getFirstAccessibleTenantPath, tenantCanAccessMenuItem } from "@/lib/tenant-permissions";
import { Header } from "@/components/header";
import { useSystemConfig } from "@/hooks/use-system-config";
import { useTenantSubscription } from "@/hooks/use-tenant-subscription";
import { SubscriptionRenewalBanner } from "@/components/subscription-renewal-banner";
import { TenantSubscriptionNotifications } from "@/components/tenant-subscription-notifications";
import { useSidebar } from "@/lib/sidebar-context";
import { AppUpdateCard } from "@/components/app-update-card";
import { Loader2 } from "lucide-react";
import { TurnSessionGate } from "@/components/turn-session-gate";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, currentUser, employees, isInitializing } = useStore();
  const { collapsed } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { config: systemConfig, loading: systemLoading } = useSystemConfig({
    keys: ["membership_block"],
    pollIntervalMs: 5000,
  });
  const isBlocked = Boolean(systemConfig?.membership_block?.enabled);
  const allowLoginWhenBlocked = Boolean(systemConfig?.membership_block?.allow_login);
  const tenantAdminId = currentUser?.role === "super_admin" ? null : currentUser?.adminId ?? null;
  const { status: subscriptionStatus, loading: subscriptionLoading } =
    useTenantSubscription(tenantAdminId);
  const isSubscriptionBlocked = Boolean(subscriptionStatus?.shouldBlockAfterLogin);

  useEffect(() => {
    // Si está inicializando, no hacer nada aún
    if (isInitializing) {
      return;
    }

    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    if (!systemLoading && isBlocked && !allowLoginWhenBlocked) {
      navigate("/bloqueo", { replace: true });
      return;
    }

    if (isAuthenticated && currentUser) {
      if (
        currentUser.role !== "super_admin" &&
        !subscriptionLoading &&
        isSubscriptionBlocked &&
        pathname !== "/suscripcion-vencida"
      ) {
        navigate("/suscripcion-vencida", { replace: true });
        return;
      }

      const normalizedPath =
        pathname === "/queue"
          ? "/cola-exclusiva"
          : pathname === "/repairs" || pathname === "/cola"
            ? "/reparaciones"
            : pathname;
      const currentMenuItem = MENU_ITEMS.find((item) => item.to === normalizedPath);

      if (currentMenuItem && !tenantCanAccessMenuItem(currentUser, employees, currentMenuItem)) {
        const fallbackPath = getFirstAccessibleTenantPath(currentUser, employees);
        if (fallbackPath !== pathname) {
          navigate(fallbackPath, { replace: true });
        }
        return;
      }
    }
  }, [
    isInitializing,
    isAuthenticated,
    systemLoading,
    isBlocked,
    allowLoginWhenBlocked,
    subscriptionLoading,
    isSubscriptionBlocked,
    pathname,
    currentUser,
    employees,
    navigate,
  ]);

  // Mostrar pantalla de carga mientras se inicializa
  if (isInitializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* Sidebar (visible en md+, oculto en móvil donde se usa el Sheet) */}
      <aside className={`fixed inset-y-0 left-0 z-50 hidden bg-[#0f172a] border-r border-gray-700 transition-all duration-300 md:block ${
        collapsed ? "w-20" : "w-64"
      }`}>
        <Sidebar />
      </aside>

      {/* Main Content */}
      <main className={`flex min-h-screen flex-col transition-all duration-300 ${
        collapsed ? "md:pl-20" : "md:pl-64"
      }`}>
        <Header />
        <div className="flex-1 overflow-auto p-2 pt-16 md:p-[1%] md:pt-20">
          <AppUpdateCard />
          {tenantAdminId && <TenantSubscriptionNotifications ownerAdminId={tenantAdminId} />}
          {subscriptionStatus?.showRenewalPrompt && (
            <SubscriptionRenewalBanner status={subscriptionStatus} />
          )}
          <TurnSessionGate />
          {children}
        </div>
      </main>
    </div>
  );
};
