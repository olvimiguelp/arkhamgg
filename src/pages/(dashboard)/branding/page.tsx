"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import {
  deleteBusinessLogoFromStorage,
  uploadBusinessLogoToStorage,
} from "@/lib/business-logo-storage"
import { clearTenantBrandingCache, THERMAL_LOGO_SIZE } from "@/lib/tenant-branding"
import { Building2, Upload, Eye, Palette, X, Plus, Trash2, Loader2, Save } from "lucide-react"

export default function BrandingPage() {
  const { businesses, updateBusiness } = useBusinessContext()
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null)
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  const business = businesses.find((b) => b.id === selectedBusiness)

  const [draft, setDraft] = useState({
    name: "",
    invoiceSubtitle: "",
    address: "",
    phones: [""],
    emails: [""],
  })

  useEffect(() => {
    if (!business) return
    setDraft({
      name: business.name,
      invoiceSubtitle: business.invoiceSubtitle || "",
      address: business.address,
      phones: business.phones?.length ? [...business.phones] : [business.phone || ""],
      emails: business.emails?.length ? [...business.emails] : [business.email || ""],
    })
    setMessage(null)
  }, [business?.id, business?.name, business?.invoiceSubtitle, business?.address, business?.phones, business?.emails, business?.phone, business?.email])

  const isDirty = useMemo(() => {
    if (!business) return false
    const phones = business.phones?.length ? business.phones : [business.phone || ""]
    const emails = business.emails?.length ? business.emails : [business.email || ""]
    return (
      draft.name !== business.name ||
      draft.invoiceSubtitle !== (business.invoiceSubtitle || "") ||
      draft.address !== business.address ||
      JSON.stringify(draft.phones) !== JSON.stringify(phones) ||
      JSON.stringify(draft.emails) !== JSON.stringify(emails)
    )
  }, [business, draft])

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedBusiness || !business) return
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploadingLogo(true)
    setMessage(null)

    const upload = await uploadBusinessLogoToStorage(business.adminId, file)
    if (!upload.success || !upload.publicUrl) {
      setMessage({ type: "error", text: upload.error || "No se pudo subir el logo" })
      setUploadingLogo(false)
      return
    }

    await updateBusiness(selectedBusiness, { logo: upload.publicUrl })
    clearTenantBrandingCache(business.adminId)
    setMessage({ type: "ok", text: "Logo guardado en Supabase Storage" })
    setUploadingLogo(false)
  }

  const handleRemoveLogo = async () => {
    if (!selectedBusiness || !business) return
    setUploadingLogo(true)
    setMessage(null)

    await deleteBusinessLogoFromStorage(business.logo)
    await updateBusiness(selectedBusiness, { logo: "" })
    clearTenantBrandingCache(business.adminId)
    setMessage({ type: "ok", text: "Logo eliminado" })
    setUploadingLogo(false)
  }

  const handleSave = async () => {
    if (!selectedBusiness || !business) return
    setSaving(true)
    setMessage(null)

    const phones = draft.phones.map((p) => p.trim()).filter(Boolean)
    const emails = draft.emails.map((e) => e.trim()).filter(Boolean)

    await updateBusiness(selectedBusiness, {
      name: draft.name.trim(),
      invoiceSubtitle: draft.invoiceSubtitle.trim(),
      address: draft.address.trim(),
      phones,
      emails,
      phone: phones[0] ?? "",
      email: emails[0] ?? "",
    })

    clearTenantBrandingCache(business.adminId)
    setMessage({ type: "ok", text: "Datos de facturacion guardados en la base de datos" })
    setSaving(false)
  }

  const handleAddPhone = () => {
    setDraft((prev) => ({ ...prev, phones: [...prev.phones, ""] }))
  }

  const handleUpdatePhone = (index: number, value: string) => {
    setDraft((prev) => {
      const phones = [...prev.phones]
      phones[index] = value
      return { ...prev, phones }
    })
  }

  const handleRemovePhone = (index: number) => {
    setDraft((prev) => {
      if (prev.phones.length <= 1) return prev
      return { ...prev, phones: prev.phones.filter((_, i) => i !== index) }
    })
  }

  const handleAddEmail = () => {
    setDraft((prev) => ({ ...prev, emails: [...prev.emails, ""] }))
  }

  const handleUpdateEmail = (index: number, value: string) => {
    setDraft((prev) => {
      const emails = [...prev.emails]
      emails[index] = value
      return { ...prev, emails }
    })
  }

  const handleRemoveEmail = (index: number) => {
    setDraft((prev) => {
      if (prev.emails.length <= 1) return prev
      return { ...prev, emails: prev.emails.filter((_, i) => i !== index) }
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Branding</h1>
        <p className="text-muted-foreground mt-1">
          Datos y logo por empresa en <code className="text-xs">saas_businesses</code> y Storage{" "}
          <code className="text-xs">branding-logos</code>. Las facturas del tenant usan esta informacion.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-red-500/30 bg-red-500/10 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-semibold text-foreground mb-4">Selecciona una empresa</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {businesses.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBusiness(b.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    selectedBusiness === b.id
                      ? "bg-blue-500/10 border border-blue-500/50"
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  {b.logo ? (
                    <img src={b.logo} alt="" className="h-10 w-10 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{b.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{b.location}</p>
                  </div>
                </button>
              ))}
              {businesses.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No hay empresas registradas</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedBusiness && business ? (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-foreground">Datos para Facturacion</h3>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar cambios
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-3">Logo de la empresa</label>
                    <div className="flex items-center gap-4">
                      {business.logo ? (
                        <div className="relative">
                          <img
                            src={business.logo}
                            alt=""
                            className="h-24 w-24 rounded-2xl object-cover border border-border"
                          />
                          <button
                            type="button"
                            disabled={uploadingLogo}
                            onClick={handleRemoveLogo}
                            className="absolute -top-2 -right-2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="h-24 w-24 rounded-2xl border-2 border-dashed border-border hover:border-blue-500/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-blue-500 transition-colors cursor-pointer">
                          {uploadingLogo ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            <Upload className="h-6 w-6" />
                          )}
                          <span className="text-xs">Subir logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
                            className="hidden"
                            disabled={uploadingLogo}
                          />
                        </label>
                      )}
                      {business.logo && (
                        <label className="text-sm text-blue-600 hover:underline cursor-pointer">
                          Cambiar imagen
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
                            className="hidden"
                            disabled={uploadingLogo}
                          />
                        </label>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Se guarda en Supabase Storage y la URL en la base de datos.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Nombre de la empresa</label>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Subtitulo de factura</label>
                    <input
                      type="text"
                      value={draft.invoiceSubtitle}
                      onChange={(e) => setDraft((p) => ({ ...p, invoiceSubtitle: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Opcional — dejar vacio para no imprimir"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Si lo dejas en blanco, no aparece en el ticket (no se usa el texto local de la app).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Direccion completa</label>
                    <textarea
                      value={draft.address}
                      onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-foreground">Telefonos (opcional)</label>
                      <button type="button" onClick={handleAddPhone} className="flex items-center gap-1 text-sm text-blue-500">
                        <Plus className="h-4 w-4" />
                        Agregar
                      </button>
                    </div>
                    <div className="space-y-2">
                      {draft.phones.map((phone, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => handleUpdatePhone(index, e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-foreground"
                          />
                          {draft.phones.length > 1 && (
                            <button type="button" onClick={() => handleRemovePhone(index)} className="p-3 text-red-500">
                              <Trash2 className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-foreground">Correos electronicos (opcional)</label>
                      <button type="button" onClick={handleAddEmail} className="flex items-center gap-1 text-sm text-blue-500">
                        <Plus className="h-4 w-4" />
                        Agregar
                      </button>
                    </div>
                    <div className="space-y-2">
                      {draft.emails.map((email, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => handleUpdateEmail(index, e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-foreground"
                          />
                          {draft.emails.length > 1 && (
                            <button type="button" onClick={() => handleRemoveEmail(index)} className="p-3 text-red-500">
                              <Trash2 className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowInvoicePreview(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium"
              >
                <Eye className="h-5 w-5" />
                Ver preview de factura
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Palette className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Selecciona una empresa</h3>
              <p className="text-muted-foreground">Elige una empresa para editar su branding de facturas</p>
            </div>
          )}
        </div>
      </div>

      {showInvoicePreview && business && (
        <InvoicePreviewModal business={{ ...business, ...draft }} onClose={() => setShowInvoicePreview(false)} />
      )}
    </div>
  )
}

function InvoicePreviewModal({
  business,
  onClose,
}: {
  business: {
    name: string
    invoiceSubtitle?: string
    address: string
    logo?: string
    phones?: string[]
    phone?: string
    emails?: string[]
    email?: string
  }
  onClose: () => void
}) {
  const phones = business.phones?.filter(Boolean).length ? business.phones! : [business.phone || ""]
  const emails = business.emails?.filter(Boolean).length ? business.emails! : [business.email || ""]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-900">Preview de Factura</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8 bg-white">
          <div className="mx-auto w-[80mm] border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <div className="flex flex-col items-center gap-2 leading-none">
                {business.logo ? (
                  <div className="flex h-20 items-center justify-center leading-[0]">
                    <img
                      src={business.logo}
                      alt=""
                      className="mx-auto block max-h-full max-w-full object-contain"
                      style={{
                        width: "auto",
                        maxWidth: `${THERMAL_LOGO_SIZE.maxWidthMm}mm`,
                        maxHeight: "100%",
                        objectFit: "contain",
                        objectPosition: "top center",
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-2xl font-bold">
                    {business.name.charAt(0)}
                  </div>
                )}
                <h1
                  className="text-xl font-black text-slate-900 uppercase leading-tight pt-0"
                >
                  {business.name}
                </h1>
              </div>
              {business.invoiceSubtitle?.trim() ? (
                <p className="text-xs font-bold text-slate-700 mt-1 tracking-wide">{business.invoiceSubtitle}</p>
              ) : null}
              {(business.address?.trim() || phones.some(Boolean) || emails.some(Boolean)) && (
                <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-xs text-slate-600 space-y-1">
                  {business.address?.trim() ? <p>{business.address}</p> : null}
                  {emails.filter(Boolean).length > 0 ? (
                    <p>E-mail: {emails.filter(Boolean).join(" | ")}</p>
                  ) : null}
                  {phones.filter(Boolean).length > 0 ? (
                    <p>Tels.: {phones.filter(Boolean).join(" / ")}</p>
                  ) : null}
                </div>
              )}
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-3">
              Vista previa 80mm — igual al ticket impreso
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
