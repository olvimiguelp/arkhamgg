# 🏢 ARKHAM — Esquema Completo del Proyecto

> **ARKHAM** — Aplicación de punto de venta (POS) multi-tenant con gestión de inventario, clientes, reparaciones, almacén, suscripciones SaaS y WhatsApp Bot.
>
> **Versión:** `1.0.17` | **Autor:** Olvin Miguel | **App ID:** `com.arkham.app`

---

## 📦 Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI Framework** | shadcn/ui (Radix UI primitives) + Tailwind CSS |
| **Estilos** | Tailwind CSS con CSS variables (modo claro/oscuro) |
| **Routing** | React Router (HashRouter para Electron) |
| **Estado / Datos** | TanStack React Query, React Context |
| **Backend (BaaS)** | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| **Desktop** | Electron (empaquetado con electron-builder → NSIS `.exe`) |
| **Bot** | WhatsApp Web.js (whatsapp-web.js) |
| **PDF / Impresión** | jsPDF + Electron `webContents.print()` |
| **Validación** | React Hook Form + Zod (hookform/resolvers) |
| **Íconos** | Lucide React |
| **Build** | TypeScript compiler (`tsc`) + Vite build |

---

## 🌳 Estructura de Carpetas

```
📁 ARKHAM/
├── 📄 index.html                          # Entry point HTML
├── 📄 package.json                        # Dependencias, scripts, config electron-builder
├── 📄 electron.cjs                        # Main process de Electron (ventana, impresión, WhatsApp bot)
├── 📄 vite.config.ts                      # Config Vite (alias @, @super_admin, base "./")
├── 📄 tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── 📄 tailwind.config.ts                  # Tailwind + shadcn/ui theme (CSS variables)
├── 📄 postcss.config.js                   # PostCSS (tailwindcss + autoprefixer)
├── 📄 eslint.config.js                    # ESLint flat config (TS + React)
├── 📄 components.json                     # Config shadcn/ui
├── 📄 bun.lockb                           # Bun lockfile
│
├── 📁 public/
│   └── 📁 Windows 10/                     # Íconos de la app (.png)
│
├── 📁 src/                                # 🎯 CÓDIGO FUENTE PRINCIPAL
│   ├── 📄 main.tsx                        # Entry point React (createRoot)
│   ├── 📄 App.tsx                         # App root: providers, rutas lazy-loaded
│   ├── 📄 globals.css                     # Estilos globales + Tailwind
│   ├── 📄 nombreconfi.ts                  # Constantes de marca (nombre, dirección, teléfonos, etc.)
│   ├── 📄 vite-env.d.ts                   # Tipos de Vite
│   │
│   ├── 📁 components/                     # 🧩 Componentes React
│   │   ├── 📁 ui/                         # ~55 componentes shadcn/ui (accordion, button, dialog, table, etc.)
│   │   ├── 📁 super-admin/               # Componentes del panel super-admin
│   │   │   ├── app-layout.tsx            # Layout del panel super-admin
│   │   │   ├── sidebar.tsx               # Sidebar super-admin
│   │   │   ├── business-form.tsx         # Formulario de negocio (CRUD tenants)
│   │   │   ├── init-super-admin-user.tsx # Inicializador de usuario super-admin
│   │   │   ├── super-admin-guard.tsx     # Guard de ruta (solo super_admin)
│   │   │   └── ui/
│   │   │       └── dropdown-menu.tsx
│   │   ├── 📁 cliente-almacen/           # Componentes del módulo cliente-almacén
│   │   │   └── almacen-sale-dialog.tsx   # Diálogo de venta a crédito en almacén
│   │   ├── Layout.tsx                    # Layout principal (sidebar + header + contenido)
│   │   ├── header.tsx                    # Header con breadcrumbs, notificaciones, perfil
│   │   ├── sidebar.tsx                   # Sidebar de navegación principal
│   │   ├── store-context.tsx             # Contexto global de tienda (empleado, tenant, permisos)
│   │   ├── theme-provider.tsx            # Provider de tema claro/oscuro
│   │   ├── auth-modal.tsx                # Modal de autenticación
│   │   ├── ProductGrid.tsx               # Grid de productos para ventas
│   │   ├── invoice-printer.tsx           # Componente de impresión de facturas
│   │   ├── factura-pagada.tsx            # Componente de factura pagada (vista/impresión)
│   │   ├── pagado.tsx                    # Indicador de pago
│   │   ├── sale-details-dialog.tsx       # Diálogo de detalles de venta
│   │   ├── almacen-customer-selector.tsx # Selector de cliente para almacén
│   │   ├── app-logo.tsx                  # Logo de la app
│   │   ├── logo.tsx                      # Componente de logo alternativo
│   │   ├── app-update-card.tsx           # Tarjeta de notificación de actualización
│   │   ├── subscription-renewal-banner.tsx # Banner de renovación de suscripción
│   │   ├── tenant-subscription-notifications.tsx # Notificaciones de suscripción
│   │   ├── system-messages-overlay.tsx   # Overlay de mensajes del sistema
│   │   ├── network-diagnostics-dialog.tsx # Diálogo de diagnóstico de red
│   │   └── legal-policies-modal.tsx      # Modal de políticas legales
│   │
│   ├── 📁 pages/                         # 📄 Páginas (rutas) — cada una con page.tsx + loading.tsx
│   │   ├── 📁 login/                     # 🔐 Login
│   │   ├── 📁 bloqueo/                   # 🚫 Pantalla de bloqueo (membresía/suscripción)
│   │   ├── 📁 suscripcion-vencida/       # ⏰ Suscripción vencida
│   │   ├── 📁 (dashboard)/               # 📊 Dashboard (ruta agrupada)
│   │   │   ├── page.tsx                  # Dashboard principal
│   │   │   ├── layout.tsx                # Layout del dashboard
│   │   │   ├── 📁 administradores/       # Gestión de administradores (super-admin)
│   │   │   ├── 📁 suscripciones/         # Gestión de suscripciones (super-admin)
│   │   │   ├── 📁 mensajes/              # Mensajes del sistema (super-admin)
│   │   │   ├── 📁 branding/              # Branding/logo por tenant (super-admin)
│   │   │   ├── 📁 facturacion/           # Facturación (super-admin)
│   │   │   └── 📁 reportes/              # Reportes globales (super-admin)
│   │   ├── 📁 ventas/                    # 💰 Punto de venta (POS)
│   │   ├── 📁 ventas-por-mayor/          # 📦 Ventas al por mayor
│   │   ├── 📁 productos/                 # 📋 Catálogo de productos
│   │   ├── 📁 productos-anadidos/        # ➕ Productos añadidos recientemente
│   │   ├── 📁 clientes/                  # 👥 Gestión de clientes
│   │   ├── 📁 cliente-almacen/           # 🏭 Cliente de almacén (cuentas por cobrar)
│   │   ├── 📁 proveedores/               # 🚚 Proveedores
│   │   ├── 📁 empleados/                 # 👤 Gestión de empleados
│   │   ├── 📁 almacen/                   # 📦 Inventario de almacén (pantallas, flex, baterías, etc.)
│   │   ├── 📁 cola/                      # 🔧 Cola de reparaciones
│   │   ├── 📁 cola-exclusiva/            # 🔒 Cola exclusiva (reparaciones VIP)
│   │   ├── 📁 devoluciones/              # ↩️ Devoluciones
│   │   ├── 📁 historial-facturas/        # 📜 Historial de facturas
│   │   ├── 📁 historial-facturas-almacen/# 📜 Historial facturas almacén
│   │   ├── 📁 registro-facturas-compra/  # 🧾 Registro de facturas de compra
│   │   ├── 📁 cierre-de-caja/            # 💵 Cierre de caja
│   │   ├── 📁 cierre-de-almacen/         # 📊 Cierre de almacén
│   │   ├── 📁 informe-cierre-turno/      # 📋 Informe de cierre de turno
│   │   ├── 📁 importar-clientes/         # 📥 Importación masiva de clientes (CSV/SQL)
│   │   └── 📁 reportes/                  # 📈 Reportes y estadísticas
│   │
│   ├── 📁 hooks/                         # 🪝 Custom hooks
│   │   ├── use-draggable-scroll.ts       # Scroll arrastrable
│   │   ├── use-enter-navigation.ts       # Navegación con tecla Enter
│   │   ├── use-mobile.ts                 # Detección de dispositivo móvil
│   │   ├── use-realtime-table-refresh.ts # Refresh en tiempo real (Supabase Realtime)
│   │   ├── use-system-config.ts          # Configuración del sistema
│   │   ├── use-system-messages.ts        # Mensajes del sistema
│   │   ├── use-tenant-subscription.ts    # Estado de suscripción del tenant
│   │   ├── use-toast.ts                  # Toast notifications
│   │   └── use-wheel-scroll.ts           # Scroll con rueda del mouse
│   │
│   ├── 📁 lib/                           # 📚 Librerías y utilidades
│   │   ├── utils.ts                      # Utilidades generales (cn, formatCurrency, etc.)
│   │   ├── types.ts                      # Re-exporta tipos de super_admin/lib/types.ts
│   │   ├── supabase/
│   │   │   └── client.ts                 # Cliente Supabase (createBrowserClient SSR)
│   │   ├── almacen.ts                    # Lógica de almacén (categorías, SKUs)
│   │   ├── almacen-closing-pdf.ts        # Generación PDF cierre de almacén
│   │   ├── cash-closing-pdf.ts           # Generación PDF cierre de caja
│   │   ├── report-pdf-generator.ts       # Generador de PDF de reportes
│   │   ├── return-pdf-generator.ts       # Generador de PDF de devoluciones
│   │   ├── invoice-storage.ts            # Almacenamiento de facturas en Supabase Storage
│   │   ├── reports-storage.ts            # Almacenamiento de reportes en Supabase Storage
│   │   ├── product-image-storage.ts      # Almacenamiento de imágenes de productos
│   │   ├── business-logo-storage.ts      # Almacenamiento de logos de negocio
│   │   ├── business-context.ts           # Contexto de negocio (tenant actual)
│   │   ├── sidebar-context.ts            # Contexto del sidebar (colapsado/expandido)
│   │   ├── tenant-permissions.ts         # Permisos por tenant (páginas, acciones)
│   │   ├── tenant-branding.ts            # Branding por tenant (logo, colores)
│   │   ├── subscription-status.ts        # Lógica de estado de suscripción
│   │   ├── membership.ts                 # Lógica de membresía (planes, pagos)
│   │   ├── admin-subscription-messages.ts # Mensajes de suscripción para admins
│   │   ├── realtime-tables.ts            # Lista de tablas con Realtime habilitado
│   │   ├── credit-sale-utils.ts          # Utilidades para ventas a crédito
│   │   ├── import-customers.ts           # Lógica de importación de clientes
│   │   ├── legal-policies.ts             # Políticas legales
│   │   ├── network-diagnostics.ts        # Diagnóstico de red
│   │   ├── supabase-connection-utils.ts  # Utilidades de conexión Supabase
│   │   ├── webhook-dns-utils.ts          # Utilidades de webhook/DNS
│   │   ├── transaction-classification.ts # Clasificación de transacciones
│   │   ├── app-logo.ts                   # Utilidad de logo
│   │   ├── app-version.ts                # Utilidad de versión
│   │   ├── print-logo.ts                 # Logo para impresión
│   │   ├── public-asset.ts               # Acceso a assets públicos
│   │   ├── storage-error.ts              # Manejo de errores de storage
│   │   └── message-links.tsx             # Links de mensajes (componente)
│   │
│   ├── 📁 types/
│   │   └── index.ts                      # Tipos base (Product, CartItem, Client, Supplier, Sale, Repair)
│   │
│   ├── 📁 supabase/
│   │   └── client.ts                     # Cliente Supabase legacy (createClient)
│   │
│   ├── 📁 styles/
│   │   ├── globals.css                   # Estilos globales
│   │   └── product-grid.css              # Estilos del grid de productos
│   │
│   └── 📁 scripts/                       # Scripts SQL de migraciones
│       ├── build-all-migrations.ps1      # Script PowerShell para compilar migraciones
│       └── all_migrations.sql            # Todas las migraciones combinadas
│
├── 📁 super_admin/                       # 🛡️ MÓDULO SUPER-ADMIN (independiente)
│   ├── 📁 components/
│   │   ├── app-layout.tsx                # Layout del panel super-admin
│   │   ├── sidebar.tsx                   # Sidebar super-admin
│   │   ├── business-form.tsx             # Formulario CRUD de negocios (tenants)
│   │   ├── init-super-admin-user.tsx     # Inicializador de usuario super-admin
│   │   ├── super-admin-guard.tsx         # Guard de ruta
│   │   └── 📁 ui/
│   │       └── dropdown-menu.tsx
│   ├── 📁 lib/
│   │   ├── auth-context.tsx              # Contexto de autenticación super-admin
│   │   ├── auth.ts                       # Utilidades de autenticación (getCurrentUser, isSuperAdmin)
│   │   ├── business-context.tsx          # Contexto de negocio (multi-tenant)
│   │   ├── sidebar-context.tsx           # Contexto del sidebar
│   │   ├── router.tsx                    # Router custom (usePathname, useRouter)
│   │   ├── dashboard-stats.ts            # Estadísticas del dashboard super-admin
│   │   ├── types.ts                      # Tipos (Business, Subscription, UserRole, etc.)
│   │   └── utils.ts                      # Utilidades (cn)
│   └── 📁 src/
│       ├── App.tsx                       # Entry point super-admin
│       ├── globals.css                   # Estilos globales super-admin
│       └── 📁 pages/
│           └── 📁 importar-clientes/     # Página de importación de clientes (super-admin)
│
├── 📁 supabase/                          # 🗄️ BACKEND (Supabase)
│   ├── 📄 config.toml                    # Config del proyecto Supabase
│   ├── 📁 functions/                     # Edge Functions
│   │   └── 📁 send-payment-reminders/    # Función de recordatorios de pago
│   │       └── index.ts
│   └── 📁 migrations/                    # 🧩 Migraciones SQL (50 archivos)
│       ├── 001-create-employees-table.sql
│       ├── 002-create-sales-table.sql
│       ├── 003-create-returns-table.sql
│       ├── 004-create-payments-table.sql
│       ├── 005-create-invoices-bucket.sql
│       ├── 006-create-products-table.sql
│       ├── 007-create-repairs-table.sql
│       ├── 008-create-customers-table.sql
│       ├── 009-create-suppliers-table.sql
│       ├── 009-create-system-config-and-purchases.sql
│       ├── 010-create-cash-closings-table.sql
│       ├── 010-create-repair-tickets-bucket.sql
│       ├── 011-add-ticket-url-to-repairs.sql
│       ├── 012-add-return-to-inventory-column.sql
│       ├── 012-modify-products-table.sql
│       ├── 013-fix-employees-rls-policies.sql
│       ├── 014-create-manual-item-costs-table.sql
│       ├── 015-fix-detalle-costos-rls.sql
│       ├── 016-enable-realtime-replication.sql
│       ├── 017-create-reports-bucket.sql
│       ├── 018-add-customer-reminders.sql
│       ├── 020-create-armacen-table.sql
│       ├── 021-rename-flesh-to-flex.sql
│       ├── 022-add-imei-to-inventory-tables.sql
│       ├── 023-create-almacen-closings-table.sql
│       ├── 024-create-cliente-almacen-module.sql
│       ├── 025-create-almacen-closing-totals-function.sql
│       ├── 026-normalize-payment-and-origin-metadata.sql
│       ├── 027-enable-inventory-id-search.sql
│       ├── 028-add-manual-paid-check-columns.sql
│       ├── 029-enable-multi-tenant-saas.sql
│       ├── 030-create-saas-businesses-table.sql
│       ├── 031-create-subscription-plans-table.sql
│       ├── 032-subscription-renewal-and-messages.sql
│       ├── 033-create-client-invoices-table.sql
│       ├── 034-client-invoices-drop-pdf-columns.sql
│       ├── 035-separate-admin-and-subscription-suspension.sql
│       ├── 036-create-branding-logos-bucket.sql
│       ├── 037-add-open-access.sql
│       ├── 038-system-messages-and-app-updates.sql
│       ├── 039-update-membership-block-contact.sql
│       ├── 040-enable-realtime-all-tables.sql
│       ├── 041-create-product-images-bucket.sql
│       ├── 042-add-product-image-url-to-products.sql
│       ├── 043-create-payment-allocations-table.sql
│       ├── 044-add-whatsapp-bot-access.sql
│       ├── 045-add-payment-method-to-payments.sql
│       ├── 046-add-minimum-sell-price-to-products.sql
│       ├── 047-add-is-wholesale-to-sales.sql
│       ├── 048-add-created-by-to-sales.sql
│       ├── 049-create-turn-sessions-table.sql
│       ├── 050-tenant-isolation-products-rls.sql
│       ├── add_turn_closings_table.sql
│       ├── all_migrations.sql            # Todas las migraciones combinadas
│       └── build-all-migrations.ps1      # Script de build
│
├── 📁 whatsapp-bot/                      # 🤖 WHATSAPP BOT
│   ├── index.js                          # Bot principal (whatsapp-web.js + LocalAuth)
│   ├── package.json
│   └── README.md
│
├── 📁 scripts/                           # 🔧 Scripts de utilidad (Node.js)
│   ├── create-storage-buckets.js         # Crear buckets en Supabase Storage
│   ├── fix-database-triggers.js          # Arreglar triggers de BD
│   ├── fix-database-triggers-rest.js     # Arreglar triggers (REST)
│   └── sync-nombreconfi.js              # Sincronizar nombre/configuración
│
├── 📁 release/                           # 📦 Builds de producción (Electron)
│   ├── ARKHAM Setup 1.0.11.exe → 1.0.17.exe  # Instaladores NSIS
│   ├── *.exe.blockmap                    # Blockmaps para auto-update
│   ├── builder-debug.yml
│   ├── builder-effective-config.yaml
│   └── 📁 win-unpacked/                  # App desempaquetada (Chromium + recursos)
│
└── 📄 Documentación
    ├── CHECKLIST_STORAGE.md              # Checklist para configurar Storage buckets
    ├── DATABASE_FIX.md                   # Guía para arreglar errores de BD (código 42883)
    └── GUIA_IMPORTACION_CLIENTES.md      # Guía de importación de clientes (CSV/SQL)
```

---

## 🗄️ Base de Datos (Supabase PostgreSQL)

### Tablas Principales

| Tabla | Descripción | Migración |
|-------|-------------|-----------|
| `employees` | Empleados (roles, permisos, tenant) | 001 |
| `sales` | Ventas (items, total, cliente, mayorista) | 002, 047, 048 |
| `returns` | Devoluciones | 003 |
| `payments` | Pagos (método, asignaciones) | 004, 043, 045 |
| `payment_allocations` | Asignaciones de pagos a ventas | 043 |
| `products` | Productos (stock, precio mín., imagen) | 006, 012, 042, 046 |
| `repairs` | Reparaciones (estado, ticket URL) | 007, 011 |
| `customers` | Clientes (deuda, recordatorios) | 008, 018 |
| `suppliers` | Proveedores | 009 |
| `system_config` | Configuración del sistema | 009 |
| `purchases` | Compras a proveedores | 009 |
| `cash_closings` | Cierres de caja | 010 |
| `expenses` | Gastos | — |
| `detalle_costos_ventas` | Detalle de costos por venta | 014, 015 |
| `armacen` | Inventario de almacén (IMEI, SKU) | 020, 022 |
| `almacen_closings` | Cierres de almacén | 023, 025 |
| `almacen_customer_accounts` | Cuentas de cliente almacén | 024 |
| `almacen_credit_sales` | Ventas a crédito almacén | 024 |
| `almacen_payments` | Pagos de clientes almacén | 024 |
| `saas_businesses` | Negocios (tenants) | 030 |
| `subscription_plans` | Planes de suscripción | 031 |
| `admin_subscription_messages` | Mensajes de suscripción | 032 |
| `tenant_subscription_notifications` | Notificaciones de suscripción | 032 |
| `client_invoices` | Facturas de cliente | 033, 034 |
| `system_messages` | Mensajes del sistema | 038 |
| `turn_sessions` | Sesiones de turno | 049 |
| `turn_closings` | Cierres de turno | add_turn_closings |

### Storage Buckets

| Bucket | Uso | Migración |
|--------|-----|-----------|
| `invoices` | PDFs de facturas | 005 |
| `repair-tickets` | Tickets de reparación | 010 |
| `reportes` | PDFs de reportes | 017 |
| `branding-logos` | Logos de negocio (tenant) | 036 |
| `product-images` | Imágenes de productos | 041 |

### Edge Functions

| Función | Descripción |
|---------|-------------|
| `send-payment-reminders` | Envío de recordatorios de pago |

---

## 🧭 Rutas de la Aplicación

### Panel Principal (HashRouter)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `#/login` | Login | Autenticación de empleados |
| `#/bloqueo` | Bloqueo | Pantalla de bloqueo por membresía/suscripción |
| `#/suscripcion-vencida` | Suscripción Vencida | Aviso de suscripción expirada |
| `#/ventas` | Ventas | Punto de venta principal (POS) |
| `#/ventas-por-mayor` | Ventas por Mayor | Ventas al por mayor |
| `#/productos` | Productos | Catálogo y gestión de productos |
| `#/productos-anadidos` | Prod. Añadidos | Productos recién añadidos |
| `#/clientes` | Clientes | Gestión de clientes |
| `#/cliente-almacen` | Cliente Almacén | Cuentas por cobrar de almacén |
| `#/proveedores` | Proveedores | Gestión de proveedores |
| `#/empleados` | Empleados | Gestión de empleados y permisos |
| `#/almacen` | Almacén | Inventario de almacén (pantallas, flex, etc.) |
| `#/cola` | Cola Reparaciones | Gestión de reparaciones |
| `#/cola-exclusiva` | Cola Exclusiva | Reparaciones VIP |
| `#/devoluciones` | Devoluciones | Gestión de devoluciones |
| `#/historial-facturas` | Historial Facturas | Historial de facturas de venta |
| `#/historial-facturas-almacen` | Hist. Fact. Almacén | Historial de facturas de almacén |
| `#/registro-facturas-compra` | Reg. Fact. Compra | Registro de facturas de compra |
| `#/cierre-de-caja` | Cierre de Caja | Cierre de caja diario |
| `#/cierre-de-almacen` | Cierre de Almacén | Cierre de almacén |
| `#/informe-cierre-turno` | Informe Cierre Turno | Informe de cierre de turno |
| `#/importar-clientes` | Importar Clientes | Importación masiva CSV/SQL |
| `#/reportes` | Reportes | Reportes y estadísticas |

### Panel Super-Admin (rutas anidadas en dashboard)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `#/(dashboard)` | Dashboard | Panel principal super-admin |
| `#/(dashboard)/administradores` | Administradores | Gestión de admins por tenant |
| `#/(dashboard)/suscripciones` | Suscripciones | Gestión de suscripciones |
| `#/(dashboard)/mensajes` | Mensajes | Mensajes del sistema |
| `#/(dashboard)/branding` | Branding | Personalización de marca por tenant |
| `#/(dashboard)/facturacion` | Facturación | Facturación global |
| `#/(dashboard)/reportes` | Reportes | Reportes globales |

---

## 🔐 Sistema de Roles y Permisos

```
super_admin
  └── admin (por tenant/business)
        └── employee (por tenant, con permisos granulares)
```

### Permisos de Empleado (tenant)

Cada empleado tiene un objeto `permissions` en la BD con booleanos para cada módulo:

| Permiso | Módulo |
|---------|--------|
| `sales` | Ventas y Facturación |
| `invoiceHistory` | Historial de Facturas |
| `returns` | Devoluciones |
| `repairs` | Reparaciones (Cola) |
| `queueExclusive` | Cola Exclusiva |
| `products` | Productos |
| `almacen` | Almacén |
| `customers` | Clientes |
| `clienteAlmacen` | Cliente Almacén |
| `suppliers` | Proveedores |
| `employees` | Empleados |
| `reports` | Reportes |
| `cashClosing` | Cierre de Caja |
| `almacenClosing` | Cierre de Almacén |
| `almacenInvoiceHistory` | Historial Facturas Almacén |
| `wholesaleSales` | Ventas por Mayor |
| `purchaseInvoices` | Registro Facturas Compra |
| `importCustomers` | Importar Clientes |
| `turnClosingReport` | Informe Cierre Turno |

---

## 🏗️ Arquitectura Multi-Tenant (SaaS)

- **`saas_businesses`**: Cada negocio es un tenant independiente con su propio `business_id`.
- **Row-Level Security (RLS)**: Todas las tablas de negocio están aisladas por `business_id` (ver migración 050).
- **Suscripciones**: Planes `gratis`, `mensual`, `trimestral`, `semestral`, `anual` con período de gracia configurable.
- **Branding**: Cada tenant puede tener su propio logo y configuración visual.
- **`openAccess`**: Flag que permite acceso sin verificar suscripción (concedido por super-admin).

---

## 🖥️ Electron — Aplicación de Escritorio

- **Main process**: `electron.cjs`
  - Crea `BrowserWindow` con Vite dev server (puerto 8080) o archivos estáticos (`dist/`).
  - Impresión silenciosa de facturas vía `webContents.print()`.
  - WhatsApp Bot integrado (`whatsapp-web.js` con `LocalAuth`).
- **Build**: `electron-builder` → instalador NSIS (`.exe`) para Windows.
- **Auto-update**: Blockmaps generados para actualizaciones incrementales.

---

## 🤖 WhatsApp Bot

- Ubicación: `whatsapp-bot/index.js`
- Librería: `whatsapp-web.js` con `LocalAuth` (sesión persistente).
- Se ejecuta con `npm run bot` o integrado en Electron.
- Funcionalidad: recordatorios de pago, notificaciones a clientes.

---

## 📄 Generación de PDFs

| Módulo | Archivo | Descripción |
|--------|---------|-------------|
| Facturas | `invoice-printer.tsx` + `invoice-storage.ts` | Impresión y almacenamiento de facturas |
| Cierre de Caja | `cash-closing-pdf.ts` | PDF de cierre de caja |
| Cierre de Almacén | `almacen-closing-pdf.ts` | PDF de cierre de almacén |
| Reportes | `report-pdf-generator.ts` | PDF de reportes |
| Devoluciones | `return-pdf-generator.ts` | PDF de devoluciones |

---

## 📦 Scripts NPM

| Script | Descripción |
|--------|-------------|
| `dev` | Vite dev server |
| `build` | `tsc && vite build` |
| `lint` | ESLint |
| `preview` | Vite preview |
| `setup:storage` | Crear buckets en Supabase Storage |
| `sync:config` | Sincronizar `nombreconfi.ts` |
| `build:migrations` | Compilar todas las migraciones SQL |
| `fix:database` | Arreglar triggers problemáticos |
| `electron:dev` | Dev con Electron (concurrently) |
| `dist` | Build + empaquetar .exe |
| `bot` | Iniciar WhatsApp Bot |

---

## 🔗 Dependencias Clave

| Paquete | Uso |
|---------|-----|
| `@supabase/supabase-js` + `@supabase/ssr` | Cliente Supabase (auth, DB, storage, realtime) |
| `@tanstack/react-query` | Fetching y caché de datos |
| `@radix-ui/*` (25+ paquetes) | Primitivos UI accesibles (base de shadcn/ui) |
| `react-hook-form` + `@hookform/resolvers` | Formularios con validación Zod |
| `go_router` (implícito vía react-router-dom) | Navegación SPA |
| `jspdf` | Generación de PDFs |
| `date-fns` | Manipulación de fechas |
| `lucide-react` | Íconos |
| `embla-carousel-react` | Carrusel |
| `cmdk` | Command palette |
| `class-variance-authority` | Variantes de componentes |
| `clsx` + `tailwind-merge` | Utilidad `cn()` para clases |
| `whatsapp-web.js` + `qrcode-terminal` | WhatsApp Bot |
| `electron` + `electron-builder` | Desktop app |
| `concurrently` + `wait-on` | Electron dev workflow |
| `lovable-tagger` | Plugin Vite para dev |

---

## 📐 Alias de Path (TypeScript + Vite)

```json
{
  "@/*":         ["./src/*"],
  "@super_admin/*": ["./super_admin/*"]
}
```

---

## 🎨 Tema (Tailwind + shadcn/ui)

- **Modo**: Claro/Oscuro (CSS variables)
- **Base color**: Slate
- **Colores primarios**: `physicalBase` (verde), `emotionalBase` (naranja), `intellectualBase` (azul)
- **Fuente**: Text theme personalizado (`AppTextTheme`)
- **Componentes glass**: `GlassCard` con `BackdropFilter` (efecto vidrio esmerilado)

---

> 📅 **Última actualización**: 2026-07-13 | **Versión**: 1.0.17