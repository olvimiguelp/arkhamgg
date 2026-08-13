export const NOMBRECONFI = {
  appName: "ARKHAM",
  appDescription: "ARKHAM - aplicación de punto de venta",
  packageName: "arkham",
  appId: "com.arkham.app",
  /** Logo en public/Windows 10/ (assets oficiales de la marca) */
  logoFile: "Windows 10/AppList.targetsize-256.png",
  businessName: "ARKHAM",
  address: "Calle hosto Esq. Mella Cotui, R.D.",
  email: "049movil@gmail.com",
  phones: "829-585-6506 / 809-350-3850",
  invoiceSubtitle: "TIENDA | DESBLOQUEO | REPARACIONES",
  metaDescription:
    "ARKHAM - Sistema completo de punto de venta con gestión de inventario, clientes y reportes",
  ogDescription: "ARKHAM - Sistema completo de punto de venta",
  /** Contacto en pagina de bloqueo / membresia */
  supportEmail: "olvimiguelp@gmail.com",
  supportPhone: "829-963-3150",
} as const;

export const CONTACT_LINES = {
  email: `E-mail: ${NOMBRECONFI.email}`,
  phones: `Tels.: ${NOMBRECONFI.phones}`,
  addressEmailInline: `${NOMBRECONFI.address} * E-mail: ${NOMBRECONFI.email}`,
} as const;
