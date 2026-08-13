"use client"

import React, { useState, useEffect, useRef } from "react"
import { X, Upload, Building2 } from "lucide-react"
import type { Business, SubscriptionPlan } from "../lib/types"
import { SUBSCRIPTION_PLANS } from "../lib/types"
import { useBusinessContext } from "../lib/business-context"

interface BusinessFormProps {
  business?: Business | null
  onSubmit: () => void
  onClose: () => void
}

export function BusinessForm({ business, onSubmit, onClose }: BusinessFormProps) {
  const { addBusiness, updateBusiness } = useBusinessContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    address: "",
    phone: "",
    email: "",
    logo: "",
    adminName: "",
    employeeCount: 1,
    subscription: undefined as Business["subscription"],
    brandColors: { primary: "#3b82f6", secondary: "#1d4ed8" },
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("mensual")

  useEffect(() => {
    if (business) {
      setFormData({
        name: business.name,
        description: business.description,
        location: business.location,
        address: business.address,
        phone: business.phone,
        email: business.email,
        logo: business.logo || "",
        adminName: business.adminName,
        employeeCount: business.employeeCount,
        subscription: business.subscription,
        brandColors: business.brandColors || { primary: "#3b82f6", secondary: "#1d4ed8" },
      })
      if (business.logo) {
        setLogoPreview(business.logo)
      }
      if (business.subscription) {
        setSubscriptionEnabled(true)
        setSelectedPlan(business.subscription.plan)
      }
    }
  }, [business])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        setLogoPreview(base64)
        setFormData({ ...formData, logo: base64 })
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = () => {
    setLogoPreview(null)
    setFormData({ ...formData, logo: "" })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    let subscription = formData.subscription
    if (subscriptionEnabled) {
      const plan = SUBSCRIPTION_PLANS.find((p) => p.value === selectedPlan)!
      const startDate = new Date()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + plan.months)
      
      subscription = {
        plan: selectedPlan,
        status: "activo",
        startDate,
        endDate,
        price: plan.price,
      }
    }
    
    if (business) {
      updateBusiness(business.id, { ...formData, subscription })
    } else {
      addBusiness({ ...formData, subscription })
    }
    onSubmit()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm overflow-y-auto py-8">
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {business ? "Editar Empresa" : "Nueva Empresa"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {business ? "Actualiza la informacion de la empresa" : "Registra una nueva empresa en el sistema"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Logo de la empresa
            </label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-20 w-20 rounded-xl object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-20 w-20 rounded-xl border-2 border-dashed border-border hover:border-blue-500/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-blue-500 transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">Subir</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPG hasta 2MB. Aparecera en facturas y recibos.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                Nombre de la empresa *
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Tech Solutions SA"
              />
            </div>

            <div>
              <label htmlFor="adminName" className="block text-sm font-medium text-foreground mb-2">
                Nombre del administrador *
              </label>
              <input
                type="text"
                id="adminName"
                required
                value={formData.adminName}
                onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Carlos Mendez"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-foreground mb-2">
                Ubicacion *
              </label>
              <input
                type="text"
                id="location"
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Ciudad de Mexico"
              />
            </div>

            <div>
              <label htmlFor="employeeCount" className="block text-sm font-medium text-foreground mb-2">
                Numero de empleados
              </label>
              <input
                type="number"
                id="employeeCount"
                min="1"
                value={formData.employeeCount}
                onChange={(e) => setFormData({ ...formData, employeeCount: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-foreground mb-2">
              Direccion completa (para facturas) *
            </label>
            <input
              type="text"
              id="address"
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="Av. Reforma 123, Col. Centro, CDMX 06000"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
                Telefono
              </label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="+52 55 1234 5678"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email *
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="contacto@empresa.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
              Descripcion
            </label>
            <textarea
              id="description"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              placeholder="Describe brevemente la empresa"
            />
          </div>

          {/* Subscription section */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Asignar suscripcion
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">Selecciona un plan para la empresa</p>
              </div>
              <button
                type="button"
                onClick={() => setSubscriptionEnabled(!subscriptionEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  subscriptionEnabled ? "bg-blue-500" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    subscriptionEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {subscriptionEnabled && (
              <div className="grid sm:grid-cols-2 gap-3">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <button
                    key={plan.value}
                    type="button"
                    onClick={() => setSelectedPlan(plan.value)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedPlan === plan.value
                        ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
                        : "border-border hover:border-blue-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-foreground">{plan.label}</span>
                      {plan.discount > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                          -{plan.discount}%
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-bold text-foreground">${plan.price.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{plan.months} {plan.months === 1 ? "mes" : "meses"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25 font-medium"
            >
              {business ? "Guardar Cambios" : "Crear Empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
