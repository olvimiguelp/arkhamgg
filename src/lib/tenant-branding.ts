import { createClient } from "@/lib/supabase/client"
import {
  BRANDING_LOGOS_BUCKET,
  extractBrandingLogoStoragePath,
  getBrandingLogoPublicUrl,
} from "@/lib/business-logo-storage"
import { loadPrintLogoDataUrl } from "@/lib/print-logo"
import { NOMBRECONFI } from "@/nombreconfi"

/** Logo en ticket 80mm (+20% sobre 70×32mm base). maxWidth cabe en el rollo. */
export const THERMAL_LOGO_SIZE = {
  widthMm: 84,
  maxWidthMm: 76,
  maxHeightMm: 38.4,
  pdfWidthMm: 81.6,
  /** Altura real del dibujo en PDF (no reservar caja enorme debajo del logo) */
  pdfHeightMm: 14,
  /** Superpone el nombre sobre el logo en tickets (mm) */
  nameOverlapMm: 10,
} as const

export const THERMAL_LOGO_NAME_OVERLAP_MM = THERMAL_LOGO_SIZE.nameOverlapMm

export const THERMAL_PRINT_LOGO_CSS = `
  width: ${THERMAL_LOGO_SIZE.widthMm}mm;
  max-width: ${THERMAL_LOGO_SIZE.maxWidthMm}mm;
  height: auto;
  max-height: ${THERMAL_LOGO_SIZE.maxHeightMm}mm;
  object-fit: contain;
  object-position: top center;
`

export type InvoicePrintConfig = {
  businessName?: string
  businessRnc?: string
  businessPhone?: string
  businessAddress?: string
  businessEmail?: string
}

export type TenantBranding = {
  ownerAdminId: string | null
  businessName: string
  invoiceSubtitle: string
  address: string
  email: string
  phones: string
  phonesList: string[]
  emailsList: string[]
  logoPublicUrl: string | null
}

type SaasBusinessBrandingRow = {
  name: string | null
  address: string | null
  phone: string | null
  phones: string[] | null
  email: string | null
  emails: string[] | null
  logo: string | null
  invoice_subtitle: string | null
}

const CACHE_TTL_MS = 5 * 60 * 1000
const brandingCache = new Map<string, { branding: TenantBranding; cachedAt: number }>()

function normalizeStringList(values: string[] | null | undefined, fallback?: string): string[] {
  const list = (values ?? [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
  if (list.length > 0) return list
  const single = String(fallback ?? "").trim()
  return single ? [single] : []
}

function resolveLogoPublicUrl(logo: string | null | undefined): string | null {
  if (!logo?.trim()) return null
  const value = logo.trim()
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value
  }

  const storagePath = extractBrandingLogoStoragePath(value) ?? value
  if (storagePath.includes("/")) {
    return getBrandingLogoPublicUrl(storagePath)
  }

  return getBrandingLogoPublicUrl(value)
}

export function getDefaultTenantBranding(): TenantBranding {
  return {
    ownerAdminId: null,
    businessName: NOMBRECONFI.businessName,
    invoiceSubtitle: NOMBRECONFI.invoiceSubtitle,
    address: NOMBRECONFI.address,
    email: NOMBRECONFI.email,
    phones: NOMBRECONFI.phones,
    phonesList: NOMBRECONFI.phones.split("/").map((p) => p.trim()).filter(Boolean),
    emailsList: [NOMBRECONFI.email],
    logoPublicUrl: null,
  }
}

export function clearTenantBrandingCache(ownerAdminId?: string) {
  if (ownerAdminId) {
    brandingCache.delete(ownerAdminId)
    return
  }
  brandingCache.clear()
}

export function mapBrandingToPrinterConfig(branding: TenantBranding): InvoicePrintConfig {
  return {
    businessName: branding.businessName,
    businessAddress: branding.address || undefined,
    businessEmail: branding.email || undefined,
    businessPhone: branding.phones || undefined,
  }
}

function mapRowToBranding(ownerAdminId: string, row: SaasBusinessBrandingRow): TenantBranding {
  const phonesList = normalizeStringList(row.phones, row.phone ?? undefined)
  const emailsList = normalizeStringList(row.emails, row.email ?? undefined)

  return {
    ownerAdminId,
    businessName: row.name?.trim() || NOMBRECONFI.businessName,
    /** Solo datos guardados en saas_businesses; sin rellenar con nombreconfi si el tenant dejo vacio */
    invoiceSubtitle: row.invoice_subtitle?.trim() ?? "",
    address: row.address?.trim() ?? "",
    email: emailsList[0] ?? "",
    phones: phonesList.join(" / "),
    phonesList,
    emailsList,
    logoPublicUrl: resolveLogoPublicUrl(row.logo),
  }
}

export async function getTenantBranding(ownerAdminId?: string | null): Promise<TenantBranding> {
  let id = String(ownerAdminId ?? "").trim()
  const supabase = createClient()

  if (!id) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        id = user.id
      }
    } catch {
      // Ignore auth error
    }
  }

  if (id) {
    const cached = brandingCache.get(id)
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.branding
    }
  }

  try {
    let query = supabase
      .from("saas_businesses")
      .select("name, address, phone, phones, email, emails, logo, invoice_subtitle")

    if (id) {
      query = query.eq("owner_admin_id", id)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (error || !data) {
      return getDefaultTenantBranding()
    }

    const branding = mapRowToBranding(id || "default", data as SaasBusinessBrandingRow)
    if (id) {
      brandingCache.set(id, { branding, cachedAt: Date.now() })
    }
    return branding
  } catch (err) {
    console.error("getTenantBranding:", err)
    return getDefaultTenantBranding()
  }
}

const escapeHtmlForPrint = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export function getPrintLogoHtmlFromBranding(branding: TenantBranding): string {
  const logoSrc = branding.logoPublicUrl
  if (!logoSrc) return ""

  const alt = `${branding.businessName} logo`.replace(/"/g, "&quot;")
  return `<div class="logo-wrap" style="text-align: center; width: 100%; display: flex; align-items: center; justify-content: center; margin: 0 auto;"><img class="print-logo" src="${logoSrc}" alt="${alt}" style="margin: 0 auto; display: block;" /></div>`
}

/** Bloque de contacto completo para tickets HTML (direccion, correos, telefonos). */
export function getBrandingContactHtml(branding: TenantBranding): string {
  const lines: string[] = []

  if (branding.address?.trim()) {
    lines.push(`<div style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.address.trim())}</div>`)
  }

  const emails = branding.emailsList.filter(Boolean)
  if (emails.length > 0) {
    lines.push(`<div style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">E-mail: ${escapeHtmlForPrint(emails.join(" | "))}</div>`)
  }

  const phones = branding.phonesList.filter(Boolean)
  if (phones.length > 0) {
    lines.push(`<div style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">Tels.: ${escapeHtmlForPrint(phones.join(" / "))}</div>`)
  }

  if (lines.length === 0) return ""
  return `<div class="contact-info" style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${lines.join("")}</div>`
}

/** Encabezado estandar: logo + nombre + subtitulo + contacto agrupados. */
export function getBrandingTicketHeaderHtml(branding: TenantBranding): string {
  const contactHtml = getBrandingContactHtml(branding)
  const logoHtml = getPrintLogoHtmlFromBranding(branding)
  const subtitleHtml = branding.invoiceSubtitle?.trim()
    ? `<div class="subtitle" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.invoiceSubtitle.trim())}</div>`
    : ""
  return `
        <div class="brand-header" style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">
          <div class="brand-title-stack" style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">${logoHtml}<div class="header" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.businessName)}</div>${subtitleHtml}</div>
          ${contactHtml ? `<div class="brand-contact" style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">${contactHtml}</div>` : ""}
        </div>
`
}

/** Encabezado para ticket de reparacion / pegatina con clases propias. */
export function getBrandingRepairHeaderHtml(branding: TenantBranding): string {
  const emails = branding.emailsList.filter(Boolean)
  const phones = branding.phonesList.filter(Boolean)
  const logoHtml = getPrintLogoHtmlFromBranding(branding)
  const subtitleHtml = branding.invoiceSubtitle
    ? `<div class="biz-subtitle" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.invoiceSubtitle)}</div>`
    : ""
  return `
          <div class="brand-title-stack" style="text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${logoHtml}<div class="biz-name" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.businessName)}</div>${subtitleHtml}</div>
          ${branding.address ? `<div class="biz-address" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">${escapeHtmlForPrint(branding.address)}</div>` : ""}
          ${emails.length ? `<div class="biz-email" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">E-mail: ${escapeHtmlForPrint(emails.join(" | "))}</div>` : ""}
          ${phones.length ? `<div class="biz-phone" style="text-align: center; width: 100%; font-family: Calibri, 'Segoe UI', Arial, sans-serif;">Tels.: ${escapeHtmlForPrint(phones.join(" / "))}</div>` : ""}
`
}

export async function resolvePrintBranding(ownerAdminId?: string | null): Promise<{
  branding: TenantBranding
  config: InvoicePrintConfig
}> {
  const branding = await getTenantBranding(ownerAdminId)
  return { branding, config: mapBrandingToPrinterConfig(branding) }
}

type ThermalPdfHeaderOptions = {
  centerX: number
  sideMargin: number
  pageWidth: number
  startY?: number
}

function measureDataUrlImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("No se pudo medir el logo"))
    img.src = dataUrl
  })
}

function computeThermalLogoHeightMm(logoWidthMm: number, naturalWidth: number, naturalHeight: number): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return THERMAL_LOGO_SIZE.pdfHeightMm
  const aspect = naturalHeight / naturalWidth
  return Math.min(logoWidthMm * aspect, THERMAL_LOGO_SIZE.maxHeightMm)
}

export async function drawBrandingHeaderOnThermalPdf(
  doc: {
    setFontSize: (n: number) => void
    setFont: (family: string, style: string) => void
    text: (text: string | string[], x: number, y: number, options?: { align?: string }) => void
    setLineWidth: (n: number) => void
    line: (x1: number, y1: number, x2: number, y2: number) => void
    addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void
    splitTextToSize: (text: string, maxWidth: number) => string[]
  },
  branding: TenantBranding,
  opts: ThermalPdfHeaderOptions,
): Promise<number> {
  const CENTER = opts.centerX
  const SIDE = opts.sideMargin
  const maxTextWidth = opts.pageWidth - SIDE * 2
  let y = opts.startY ?? 4

  const logoDataUrl = await loadBrandingLogoDataUrl(branding)
  if (logoDataUrl) {
    const mimeMatch = /^data:([^;]+);/i.exec(logoDataUrl)
    const mimeType = String(mimeMatch?.[1] || "").toLowerCase()
    const format = mimeType.includes("png") ? "PNG" : "JPEG"
    const logoWidth = Math.min(THERMAL_LOGO_SIZE.pdfWidthMm, opts.pageWidth - SIDE * 2)
    let logoHeight = THERMAL_LOGO_SIZE.pdfHeightMm
    try {
      const dims = await measureDataUrlImage(logoDataUrl)
      logoHeight = computeThermalLogoHeightMm(logoWidth, dims.width, dims.height)
    } catch {
      logoHeight = THERMAL_LOGO_SIZE.pdfHeightMm
    }
    const logoX = (opts.pageWidth - logoWidth) / 2
    doc.addImage(logoDataUrl, format, logoX, y, logoWidth, logoHeight)
    y += logoHeight + 1.5
  }

  doc.setFontSize(16)
  doc.setFont("courier", "bold")
  doc.text(branding.businessName, CENTER, y, { align: "center" })
  y += 4.5

  doc.setFontSize(10)
  doc.setFont("courier", "normal")

  if (branding.invoiceSubtitle?.trim()) {
    doc.text(branding.invoiceSubtitle.trim(), CENTER, y, { align: "center" })
    y += 5
  }

  if (branding.address?.trim()) {
    const addressLines = doc.splitTextToSize(branding.address.trim(), maxTextWidth)
    doc.text(addressLines, CENTER, y, { align: "center" })
    y += addressLines.length * 4 + 2
  }

  const emails = branding.emailsList.filter(Boolean)
  if (emails.length > 0) {
    const emailText = `E-mail: ${emails.join(" | ")}`
    const emailLines = doc.splitTextToSize(emailText, maxTextWidth)
    doc.text(emailLines, CENTER, y, { align: "center" })
    y += emailLines.length * 4 + 2
  }

  const phones = branding.phonesList.filter(Boolean)
  if (phones.length > 0) {
    const phoneText = `TEL: ${phones.join(" / ")}`
    const phoneLines = doc.splitTextToSize(phoneText, maxTextWidth)
    doc.text(phoneLines, CENTER, y, { align: "center" })
    y += phoneLines.length * 4 + 2
  }

  doc.setLineWidth(1.2)
  doc.line(SIDE, y, opts.pageWidth - SIDE, y)
  y += 5

  return y
}

type ClosingPdfHeaderOptions = {
  pageWidth: number
  headerTitle: string
  nameStartY?: number
  lineStep?: number
}

/** Encabezado para PDFs de cierre (fondo oscuro, unidades del doc) con contacto completo. */
export function drawBrandingClosingHeaderPdf(
  doc: {
    setFillColor: (r: number, g: number, b: number) => void
    rect: (x: number, y: number, w: number, h: number, style: string) => void
    setTextColor: (r: number, g: number, b: number) => void
    setFontSize: (n: number) => void
    setFont: (family: string, style: string) => void
    text: (text: string | string[], x: number, y: number, options?: { align?: string }) => void
    splitTextToSize: (text: string, maxWidth: number) => string[]
  },
  branding: TenantBranding,
  opts: ClosingPdfHeaderOptions,
): number {
  const centerX = opts.pageWidth / 2
  const lineStep = opts.lineStep ?? 8
  const maxW = opts.pageWidth - 16
  let textY = opts.nameStartY ?? 25

  const contactBlocks: string[] = []
  if (branding.address?.trim()) contactBlocks.push(branding.address.trim())
  const emails = branding.emailsList.filter(Boolean)
  if (emails.length > 0) contactBlocks.push(`E-mail: ${emails.join(" | ")}`)
  const phones = branding.phonesList.filter(Boolean)
  if (phones.length > 0) contactBlocks.push(`Tels.: ${phones.join(" / ")}`)

  let contactLineCount = 0
  contactBlocks.forEach((block) => {
    contactLineCount += doc.splitTextToSize(block, maxW).length
  })

  const subtitleExtra = branding.invoiceSubtitle?.trim() ? lineStep + 2 : 0
  const titleArea = 18
  const headerH = Math.max(
    85,
    textY + 12 + subtitleExtra + contactLineCount * lineStep + titleArea,
  )

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, opts.pageWidth, headerH, "F")

  doc.setTextColor(255, 102, 0)
  doc.setFontSize(22)
  doc.setFont("courier", "bold")
  doc.text(branding.businessName, centerX, textY, { align: "center" })
  textY += 11

  if (branding.invoiceSubtitle?.trim()) {
    doc.setFontSize(9)
    doc.setFont("courier", "bold")
    doc.text(branding.invoiceSubtitle.trim(), centerX, textY, { align: "center" })
    textY += lineStep + 2
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont("courier", "normal")

  contactBlocks.forEach((block) => {
    const lines = doc.splitTextToSize(block, maxW)
    doc.text(lines, centerX, textY, { align: "center" })
    textY += lines.length * lineStep
  })

  doc.setFontSize(14)
  doc.setFont("courier", "bold")
  doc.text(opts.headerTitle, centerX, headerH - 10, { align: "center" })

  doc.setTextColor(0, 0, 0)
  return headerH + 2
}

export async function loadBrandingLogoDataUrl(branding: TenantBranding): Promise<string | null> {
  if (!branding.logoPublicUrl) {
    return loadPrintLogoDataUrl()
  }

  try {
    const response = await fetch(branding.logoPublicUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.error("loadBrandingLogoDataUrl:", err)
    return loadPrintLogoDataUrl()
  }
}

export async function saveTenantBrandingToDatabase(
  businessId: string,
  ownerAdminId: string,
  updates: {
    name?: string
    invoiceSubtitle?: string
    address?: string
    phones?: string[]
    emails?: string[]
    logo?: string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) payload.name = updates.name
    if (updates.invoiceSubtitle !== undefined) payload.invoice_subtitle = updates.invoiceSubtitle || null
    if (updates.address !== undefined) payload.address = updates.address
    if (updates.phones !== undefined) {
      payload.phones = updates.phones
      payload.phone = updates.phones[0] ?? ""
    }
    if (updates.emails !== undefined) {
      payload.emails = updates.emails
      payload.email = updates.emails[0] ?? ""
    }
    if (updates.logo !== undefined) payload.logo = updates.logo

    const { error } = await supabase.from("saas_businesses").update(payload).eq("id", businessId)

    if (error) {
      return { success: false, error: error.message }
    }

    clearTenantBrandingCache(ownerAdminId)
    return { success: true }
  } catch (err) {
    console.error("saveTenantBrandingToDatabase:", err)
    return { success: false, error: "No se pudo guardar el branding" }
  }
}
