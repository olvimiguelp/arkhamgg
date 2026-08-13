"use client"

import React, { useEffect, useState } from "react"
import QRCode from "qrcode"
import { useStore, type Repair } from "@/components/store-context"
import { NOMBRECONFI } from "@/nombreconfi"
import { resolvePrintBranding, getTenantBranding, getBrandingRepairHeaderHtml } from "@/lib/tenant-branding"
import type { TenantBranding } from "@/lib/tenant-branding"
import { formatDeviceName } from "@/lib/repair-utils"

interface PrintProps {
  repair: Partial<Repair> & {
    client?: string
    customerPhone?: string
    whatsapp?: string
    device?: string
    brand?: string
    model?: string
    imei?: string
    color?: string
    issue?: string
    cost?: string | number
    deposit?: number
    pendingBalance?: number
    repair_number?: string
    password?: string
    unlockPattern?: string
    visualNotes?: string
    checklist?: Record<string, "si" | "no" | "no_probado">
    technician?: string
    date?: string
  }
  shopName?: string
  shopPhone?: string
  shopAddress?: string
}

function buildRepairStickerQrPayload(repair: Partial<Repair> & { [key: string]: any }) {
  const ticketNumber = repair.repair_number || repair.id || ""
  return `https://arkhamgg.vercel.app/reparaciones?repair=${encodeURIComponent(ticketNumber)}`
}

function printHtmlViaHiddenIframe(html: string) {
  try {
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    // Algunos navegadores imprimen una página en blanco si el iframe está
    // oculto, mide 1px o tiene opacidad 0. Usamos el tamaño real del sticker
    // para garantizar que el contenido se renderice antes de imprimir.
    iframe.style.left = "0"
    iframe.style.top = "0"
    iframe.style.width = "38mm"
    iframe.style.height = "27mm"
    iframe.style.opacity = "1"
    iframe.style.border = "0"
    iframe.style.zIndex = "2147483647"
    iframe.style.backgroundColor = "#fff"
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      setTimeout(() => {
        try { iframe.remove() } catch (_) {}
      }, 1000)
      return
    }

    let printed = false
    const triggerPrint = () => {
      if (printed) return
      printed = true
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (err) {
        console.error("Error al lanzar la impresión:", err)
      }
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
        } catch (_) {}
      }, 1000)
    }

    iframe.onload = triggerPrint

    doc.open()
    doc.write(html)
    doc.close()

    setTimeout(triggerPrint, 250)
  } catch (e) {
    console.error("Print iframe error:", e)
  }
}

export async function printRepairTicketDirect(
  repair: Partial<Repair> & { [key: string]: any },
  overrideShopName?: string,
  overridePhone?: string,
  overrideAddress?: string,
  ownerAdminId?: string | null,
) {
  const { branding, config } = await resolvePrintBranding(ownerAdminId)
  const shopName = overrideShopName || config.businessName || branding.businessName || NOMBRECONFI.businessName || "ARKHAM"
  const shopPhone = overridePhone || config.businessPhone || branding.phones || NOMBRECONFI.phones || ""
  const shopAddress = overrideAddress || config.businessAddress || branding.address || NOMBRECONFI.address || ""

  const ticketNumber = repair.repair_number || repair.id || ""
  const formattedDate = repair.date
    ? new Date(repair.date).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })

  const totalCost = Number(repair.cost) || 0
  const depositAmt = Number(repair.deposit) || 0
  const pendingAmt = repair.pendingBalance !== undefined ? Number(repair.pendingBalance) : Math.max(0, totalCost - depositAmt)
  const serviceItems = Array.isArray(repair.serviceItems) && repair.serviceItems.length > 0
    ? repair.serviceItems
    : [{ name: repair.type || "Reparación general", pieceCost: 0, charge: totalCost }]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Orden de Reparación #${ticketNumber}</title>
      <style>
        @page { size: auto; margin: 0mm; }
        body {
          font-family: Calibri, Arial, sans-serif;
          font-size: 14px;
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ticket {
          width: 80mm;
          max-width: 80mm;
          margin: 0 auto;
          padding: 2mm;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 5px;
          margin-bottom: 5px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .brand-title-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1mm;
          max-width: 100%;
          width: 100%;
          overflow: hidden;
          text-align: center;
        }
        .brand-title-stack .logo-wrap {
          width: 100%;
          max-width: 76mm;
          max-height: 24mm;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
        }
        .brand-title-stack .print-logo {
          display: block;
          margin: 0 auto;
          max-width: 76mm;
          max-height: 24mm;
          width: auto;
          height: auto;
          object-fit: contain;
        }
        .brand-title-stack .biz-name {
          max-width: 100%;
          width: 100%;
          text-align: center;
          overflow-wrap: anywhere;
          font-size: 20px;
          font-weight: 900;
          line-height: 1.1;
        }
        .biz-address,
        .biz-email,
        .biz-phone,
        .biz-subtitle {
          text-align: center;
          width: 100%;
        }
        .shop-title {
          font-size: 20px;
          font-weight: 900;
          text-transform: uppercase;
          text-align: center;
          width: 100%;
        }
        .shop-info {
          font-size: 14px;
          text-align: center;
          width: 100%;
        }
        .section {
          border-bottom: 1px dashed #000;
          padding-bottom: 5px;
          margin-bottom: 5px;
        }
        .section-title {
          font-weight: bold;
          font-size: 11px;
          text-transform: uppercase;
          border-bottom: 1px solid #ddd;
          padding-bottom: 2px;
          margin-bottom: 4px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .service-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 3px 0;
          border-bottom: 1px dotted #999;
        }
        .service-name { flex: 1; word-break: break-word; }
        .service-price { font-weight: bold; white-space: nowrap; }
        .multiline { white-space: pre-wrap; word-break: break-word; }
        .bold { font-weight: bold; }
        .text-right { text-align: right; }
        .qr-container {
          text-align: center;
          margin: 8px 0;
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          padding: 6px 0;
        }
        .qr-container img {
          display: none;
          margin: 0 auto 3px auto;
        }
        .qr-label {
          font-size: 13px;
          font-weight: bold;
        }
        .terms {
          font-size: 11px;
          line-height: 1.3;
          border: 1px solid #666;
          padding: 4px;
          margin-top: 6px;
          background: #f9f9f9;
        }
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 25px;
          text-align: center;
          font-size: 12px;
        }
        .signature-box {
          width: 45%;
          border-top: 1px solid #000;
          padding-top: 2px;
        }
        .signature-lines {
          margin-top: 6px;
        }
        .signature-lines div {
          border-top: 1px solid #000;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingRepairHeaderHtml(branding)}
        <div style="font-size: 9px; margin-top: 3px; color: #444; text-align: center;">Fecha: ${formattedDate}</div>

        <div class="section">
          <div class="section-title">DATOS DEL CLIENTE</div>
          <div><span class="bold">Cliente:</span> ${repair.client || "Sin registrar"}</div>
          <div><span class="bold">Teléfono / WA:</span> ${repair.customerPhone || "N/A"}</div>
        </div>

        <div class="section">
          <div class="section-title">DATOS DEL DISPOSITIVO</div>
          <div><span class="bold">Equipo:</span> ${formatDeviceName(repair.brand, repair.model, repair.device)}</div>
          ${repair.imei ? `<div><span class="bold">IMEI / Serie:</span> ${repair.imei}</div>` : ""}
          ${repair.color ? `<div><span class="bold">Color:</span> ${repair.color}</div>` : ""}
          ${(repair.password || repair.unlockPattern) ? `<div><span class="bold">Clave/Patrón:</span> ${repair.unlockPattern ? `Patrón: ${repair.unlockPattern}` : repair.password}</div>` : ""}
        </div>

        <div class="section">
          <div class="section-title">DIAGNÓSTICO INICIAL</div>
          <div><span class="bold">Falla Reportada:</span> ${repair.issue || "No especificada"}</div>
          ${repair.visualNotes ? `<div><span class="bold">Detalles Visuales:</span> ${repair.visualNotes}</div>` : ""}
        </div>

        <div class="section">
          <div class="section-title">SERVICIOS A REALIZAR</div>
          ${serviceItems.map((item: any) => `<div class="service-row"><span class="service-name">Servicio: ${item.name}</span><span class="service-price">RD$ ${(Number(item.charge) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span></div>`).join("")}
        </div>

        <div class="section">
          <div class="section-title">DESGLOSE DE PAGO</div>
          <div class="row">
            <span>Costo Estimado:</span>
            <span class="bold">RD$ ${totalCost.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="row" style="color: #006600;">
            <span>Abono / Adelanto:</span>
            <span class="bold">- RD$ ${depositAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="row bold" style="font-size: 13px; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px; color: #cc0000;">
            <span>SALDO PENDIENTE:</span>
            <span>RD$ ${pendingAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div class="terms">
          <b>TÉRMINOS Y GARANTÍA:</b><br/>
          1. Garantía de 30 días únicamente sobre el repuesto instalado.<br/>
          2. La garantía no cubre golpes, humedad, mal uso ni nuevas fallas.<br/>
          3. Equipos mojados o intervenidos no tienen garantía de placa.<br/>
          4. <b>IMPORTANTE:</b> El teléfono debe retirarse en un máximo de 15 días.
        </div>

        <div class="signatures">
          <div class="signature-box">Firma Cliente<div class="signature-lines"><div></div></div></div>
          <div class="signature-box">Firma Taller<div class="signature-lines"><div></div></div></div>
        </div>
      </div>
    </body>
    </html>
  `

  printHtmlViaHiddenIframe(html)
}

export async function printRepairStickerDirect(
  repair: Partial<Repair> & { [key: string]: any },
  overrideShopName?: string,
  ownerAdminId?: string | null,
) {
  const { branding, config } = await resolvePrintBranding(ownerAdminId)
  const shopName = overrideShopName || config.businessName || branding.businessName || NOMBRECONFI.businessName || "ARKHAM"
  const rawTicketNumber = repair.repair_number || repair.id || ""
  const ticketNumber = rawTicketNumber ? (String(rawTicketNumber).startsWith("#") ? rawTicketNumber : `#${rawTicketNumber}`) : ""
  const fullClientName = (repair.client || "").trim().toUpperCase()
  const clientFirstName = (fullClientName.split(/\s+/)[0] || "").trim()
  const companyVerticalName = (shopName || "ARKHAM").trim().toUpperCase()
  const stickerUnlockValue = (repair.unlockPattern || repair.password || "").trim()
  const qrPayload = buildRepairStickerQrPayload(repair)

  let qrDataUrl = ""
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 })
  } catch (err) {
    console.error("Error generando QR para sticker:", err)
  }

  const nameLength = Math.max(clientFirstName.length, companyVerticalName.length)
  const nameFontSize = nameLength > 12 ? "2.5mm" : nameLength > 8 ? "2.9mm" : "3.3mm"

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Sticker Orden ${ticketNumber}</title>
      <style>
        @page { size: 38mm 27mm; margin: 0mm; }
        html, body {
          width: 38mm;
          height: 27mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        body {
          font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
          font-size: 12px;
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          line-height: 1.2;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sticker {
          width: 38mm;
          height: 27mm;
          padding: 0.6mm;
          box-sizing: border-box;
          background: #fff;
          text-align: center;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sticker-layout {
          display: grid;
          grid-template-columns: 7mm 22mm 7mm;
          grid-template-rows: 3.5mm 18.5mm 2.6mm;
          width: 36mm;
          height: 24.6mm;
          margin: 0 auto;
          column-gap: 0;
          row-gap: 0;
          align-items: center;
        }
        .client-name {
          grid-column: 1;
          grid-row: 1 / span 3;
          width: 7mm;
          height: 24.6mm;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: ${nameFontSize};
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
          writing-mode: vertical-rl;
          -webkit-writing-mode: vertical-rl;
          transform: rotate(180deg);
          line-height: 1;
          letter-spacing: 0.1mm;
          margin: 0;
          padding: 0;
          text-align: center;
        }
        .company-name {
          grid-column: 3;
          grid-row: 1 / span 3;
          width: 7mm;
          height: 24.6mm;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: ${nameFontSize};
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
          writing-mode: vertical-rl;
          -webkit-writing-mode: vertical-rl;
          transform: rotate(180deg);
          line-height: 1;
          letter-spacing: 0.1mm;
          margin: 0;
          padding: 0;
          text-align: center;
        }
        .qr-box {
          grid-column: 2;
          grid-row: 2;
          width: 22mm;
          height: 18.5mm;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          position: relative;
        }
        .customer-phone {
          grid-column: 2;
          grid-row: 1;
          width: 22mm;
          overflow: hidden;
          font-size: 3.2mm;
          font-weight: 900;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
          letter-spacing: 0.1mm;
        }
        .qr-box img {
          width: 18.5mm;
          height: 18.5mm;
          display: block;
          margin: 0 auto;
        }
        .ticket-number {
          grid-column: 2;
          grid-row: 3;
          width: 22mm;
          overflow: hidden;
          font-size: 2.4mm;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.1mm;
          white-space: nowrap;
          text-align: center;
        }
        .brand-logo { position: absolute; top: 0.5mm; right: 0.5mm; width: 5.5mm; height: 5.5mm; object-fit: contain; }
      </style>
    </head>
    <body>
      <div class="sticker">
        <div class="sticker-layout">
          <div class="client-name">${clientFirstName}</div>
          <div class="company-name">${companyVerticalName}</div>
          ${stickerUnlockValue ? `<div class="customer-phone">${stickerUnlockValue}</div>` : ""}
          ${qrDataUrl ? `<div class="qr-box"><img src="${qrDataUrl}" alt="QR" /></div>` : ""}
          ${ticketNumber ? `<div class="ticket-number">${ticketNumber}</div>` : ""}
        </div>
      </div>
    </body>
    </html>
  `

  printHtmlViaHiddenIframe(html)
}

export function RepairTicketPrint({
  repair,
  shopName = NOMBRECONFI.businessName || "ARKHAM REPARACIONES & POS",
  shopPhone = NOMBRECONFI.phones || "",
  shopAddress = NOMBRECONFI.address || "Santo Domingo, República Dominicana",
}: PrintProps) {
  const { currentUser } = useStore()
  const [branding, setBranding] = useState<TenantBranding | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const tenantBranding = await getTenantBranding(
          currentUser?.ownerAdminId || currentUser?.adminId || currentUser?.id,
        )
        if (!cancelled) setBranding(tenantBranding)
      } catch (err) {
        console.error("Error loading repair print branding:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.ownerAdminId, currentUser?.adminId, currentUser?.id])

  const ticketNumber = repair.repair_number || repair.id || ""

  const formattedDate = repair.date
    ? new Date(repair.date).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })

  const totalCost = Number(repair.cost) || 0
  const depositAmt = Number(repair.deposit) || 0
  const pendingAmt = repair.pendingBalance !== undefined ? Number(repair.pendingBalance) : Math.max(0, totalCost - depositAmt)
  const serviceItems = Array.isArray(repair.serviceItems) && repair.serviceItems.length > 0
    ? repair.serviceItems
    : [{ name: repair.type || "Reparación general", pieceCost: 0, charge: totalCost }]

  return (
    <div className="ticket-print-container text-xs text-black p-4 w-full max-w-[320px] box-border mx-auto bg-white border border-slate-300 overflow-hidden" style={{ fontFamily: "Calibri, Arial, sans-serif" }}>
      {/* Header */}
      <div className="text-center border-b pb-3 mb-3 border-dashed border-slate-400">
        {branding?.logoPublicUrl && (
          <img
            src={branding.logoPublicUrl}
            alt={`${branding.businessName} logo`}
            className="mx-auto mb-2 max-w-full object-contain"
            style={{ maxHeight: "52px", width: "auto" }}
          />
        )}
        <h2 className="text-base font-extrabold uppercase break-words">{branding?.businessName || shopName}</h2>
        <p className="text-[11px]">{branding?.address || shopAddress}</p>
        <p className="text-[11px]">Tel: {branding?.phones || shopPhone}</p>
        <div className="hidden">
          ORDEN DE REPARACIÓN #{ticketNumber}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Fecha: {formattedDate}</p>
      </div>

      {/* Datos del Cliente */}
      <div className="mb-3 pb-2 border-b border-dashed border-slate-400 space-y-1">
        <p className="font-bold text-[11px] uppercase border-b border-slate-200 pb-0.5">DATOS DEL CLIENTE</p>
        <p><span className="font-semibold">Cliente:</span> {repair.client || "Sin registrar"}</p>
        <p><span className="font-semibold">Teléfono / WA:</span> {repair.customerPhone || "N/A"}</p>
      </div>

      {/* Datos del Dispositivo */}
      <div className="mb-3 pb-2 border-b border-dashed border-slate-400 space-y-1">
        <p className="font-bold text-[11px] uppercase border-b border-slate-200 pb-0.5">DATOS DEL DISPOSITIVO</p>
        <p><span className="font-semibold">Equipo:</span> {formatDeviceName(repair.brand, repair.model, repair.device)}</p>
        {repair.imei && <p><span className="font-semibold">IMEI / Serie:</span> {repair.imei}</p>}
        {repair.color && <p><span className="font-semibold">Color:</span> {repair.color}</p>}
        {(repair.password || repair.unlockPattern) && (
          <p><span className="font-semibold">Clave/Patrón:</span> {repair.unlockPattern ? `Patrón: ${repair.unlockPattern}` : repair.password}</p>
        )}
      </div>

      {/* Falla e Inspección */}
      <div className="mb-3 pb-2 border-b border-dashed border-slate-400 space-y-1">
        <p className="font-bold text-[11px] uppercase border-b border-slate-200 pb-0.5">DIAGNÓSTICO INICIAL</p>
        <p><span className="font-semibold">Falla Reportada:</span> {repair.issue || "No especificada"}</p>
        {repair.visualNotes && <p><span className="font-semibold">Detalles Visuales:</span> {repair.visualNotes}</p>}
      </div>

      {serviceItems.length > 0 && (
        <div className="mb-3 pb-2 border-b border-dashed border-slate-400 space-y-1">
          <p className="font-bold text-[11px] uppercase border-b border-slate-200 pb-0.5">SERVICIOS A REALIZAR</p>
          {serviceItems.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex justify-between gap-2">
              <span className="break-words">Servicio: {item.name}</span>
              <span className="font-bold whitespace-nowrap">
                RD$ {(Number(item.charge) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Presupuesto */}
      <div className="mb-3 pb-2 border-b border-dashed border-slate-400 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Costo Estimado:</span>
          <span className="font-bold">RD$ {totalCost.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-emerald-700">
          <span>Abono / Adelanto:</span>
          <span className="font-bold">- RD$ {depositAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-rose-700 font-extrabold border-t border-slate-300 pt-1 text-base">
          <span>SALDO PENDIENTE:</span>
          <span>RD$ {pendingAmt.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Cláusula Legal */}
      <div className="mb-4 text-[9px] text-slate-700 leading-tight border p-2 bg-slate-50 rounded">
        <p className="font-bold uppercase mb-0.5">TÉRMINOS Y CONDICIONES DE GARANTÍA:</p>
        <p>
          1. Trabajos garantizados por 30 días en el repuesto instalado.
          2. Equipos mojados o intervenidos previamente no tienen garantía de placa.
          3. <strong>IMPORTANTE:</strong> Equipos no retirados después de 15 días pasarán a proceso de reciclaje o cobro de depósito/almacenaje.
        </p>
      </div>

      {/* Firmas */}
      <div className="pt-6 grid grid-cols-2 gap-4 text-center text-[10px]">
        <div className="border-t border-black pt-1">
          Firma Cliente
          <div className="mt-3 space-y-1">
            <div className="border-t border-black" />
          </div>
        </div>
        <div className="border-t border-black pt-1">
          Firma Taller
          <div className="mt-3 space-y-1">
            <div className="border-t border-black" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function RepairStickerPrint({ repair }: PrintProps) {
  const [qrUrl, setQrUrl] = useState<string>("")
  const rawTicketNumber = repair.repair_number || repair.id || ""
  const ticketNumber = rawTicketNumber ? (String(rawTicketNumber).startsWith("#") ? rawTicketNumber : `#${rawTicketNumber}`) : ""
  const stickerUnlockValue = (repair.unlockPattern || repair.password || "").trim()
  const fullClientName = (repair.client || "").trim().toUpperCase()
  const clientFirstName = (fullClientName.split(/\s+/)[0] || "").trim()
  const { currentUser } = useStore()
  const [branding, setBranding] = useState<TenantBranding | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const b = await getTenantBranding(
          currentUser?.ownerAdminId || currentUser?.adminId || currentUser?.id,
        )
        if (!cancelled) setBranding(b)
      } catch (err) {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.ownerAdminId, currentUser?.adminId, currentUser?.id])

  const companyVerticalName = (branding?.businessName || "ARKHAM").trim().toUpperCase()

  useEffect(() => {
    if (rawTicketNumber) {
      const payload = buildRepairStickerQrPayload(repair)
      QRCode.toDataURL(payload, { margin: 1, width: 150 })
        .then((url) => setQrUrl(url))
        .catch((err) => console.error("Error generating QR:", err))
    }
  }, [rawTicketNumber, repair])

  const nameLength = Math.max(clientFirstName.length, companyVerticalName.length)
  const nameFontSize = nameLength > 12 ? "2.5mm" : nameLength > 8 ? "2.9mm" : "3.3mm"

  return (
    <div
      className="sticker-print-container text-black mx-auto bg-white leading-none overflow-hidden"
      style={{
        width: "38mm",
        height: "27mm",
        padding: "0.6mm",
        boxSizing: "border-box",
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
      }}
    >
      <div
        className="grid items-center mx-auto"
        style={{
          gridTemplateColumns: "7mm 22mm 7mm",
          gridTemplateRows: "3.5mm 18.5mm 2.6mm",
          width: "36mm",
          height: "24.6mm",
          columnGap: 0,
          rowGap: 0,
        }}
      >
        <div
          className="flex items-center justify-center overflow-hidden font-black uppercase text-center whitespace-nowrap"
          style={{
            gridColumn: 1,
            gridRow: "1 / span 3",
            width: "7mm",
            height: "24.6mm",
            fontSize: nameFontSize,
            writingMode: "vertical-rl",
            WebkitWritingMode: "vertical-rl",
            transform: "rotate(180deg)",
            lineHeight: "1",
            letterSpacing: "0.1mm",
            margin: 0,
            padding: 0,
          }}
        >
          {clientFirstName}
        </div>
        <div
          className="flex items-center justify-center overflow-hidden font-black uppercase text-center whitespace-nowrap"
          style={{
            gridColumn: 3,
            gridRow: "1 / span 3",
            width: "7mm",
            height: "24.6mm",
            fontSize: nameFontSize,
            writingMode: "vertical-rl",
            WebkitWritingMode: "vertical-rl",
            transform: "rotate(180deg)",
            lineHeight: "1",
            letterSpacing: "0.1mm",
            margin: 0,
            padding: 0,
          }}
        >
          {companyVerticalName}
        </div>
        {stickerUnlockValue && (
          <div
            className="overflow-hidden text-center font-black whitespace-nowrap"
            style={{ gridColumn: 2, gridRow: 1, width: "22mm", fontSize: "3.2mm", letterSpacing: "0.1mm" }}
          >
            {stickerUnlockValue}
          </div>
        )}
        {qrUrl && (
          <div
            className="flex items-center justify-center"
            style={{ gridColumn: 2, gridRow: 2, width: "22mm", height: "18.5mm" }}
          >
            <div style={{ position: "relative", width: "18.5mm", height: "18.5mm" }}>
              <img src={qrUrl} alt="QR" style={{ width: "18.5mm", height: "18.5mm" }} />
            </div>
          </div>
        )}
        {ticketNumber && (
          <div
            className="overflow-hidden text-center font-black whitespace-nowrap"
            style={{ gridColumn: 2, gridRow: 3, width: "22mm", fontSize: "2.4mm", letterSpacing: "0.1mm" }}
          >
            {ticketNumber}
          </div>
        )}
      </div>
    </div>
  )
}
