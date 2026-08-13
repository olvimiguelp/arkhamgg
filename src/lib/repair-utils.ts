import { Repair, Customer } from "@/components/store-context"

export function getPhoneForRepair(repair: Partial<Repair> | null | undefined, customers: Customer[] = []): string {
  if (!repair) return ""

  // 1. Check direct phone / whatsapp fields on repair
  if (repair.whatsapp && repair.whatsapp.trim()) return repair.whatsapp.trim()
  if (repair.customerPhone && repair.customerPhone.trim()) return repair.customerPhone.trim()

  // 2. Check customerId link
  const anyRepair = repair as any
  const custId = anyRepair.customerId || anyRepair.customer_id || anyRepair.selectedCustomerId
  if (custId) {
    const foundById = customers.find((c) => c.id === custId)
    if (foundById) {
      const ph = foundById.whatsapp || foundById.phone
      if (ph && ph.trim()) return ph.trim()
    }
  }

  // 3. Match by client name in customers array
  const clientClean = (repair.client || "").trim().toLowerCase()
  if (clientClean) {
    // Exact name match
    let found = customers.find((c) => c.name && c.name.trim().toLowerCase() === clientClean)
    // Partial match if no exact match
    if (!found) {
      found = customers.find(
        (c) =>
          c.name &&
          c.name.trim().length >= 3 &&
          (c.name.trim().toLowerCase().includes(clientClean) || clientClean.includes(c.name.trim().toLowerCase()))
      )
    }
    if (found) {
      const ph = found.whatsapp || found.phone
      if (ph && ph.trim()) return ph.trim()
    }

    // Check if client string itself is/contains digits for a phone number
    const clientDigits = clientClean.replace(/\D/g, "")
    if (clientDigits.length >= 7 && clientDigits.length <= 15) {
      return clientDigits
    }
  }

  // 4. Regex search in notes, issue, password, device
  const textToSearch = `${repair.visualNotes || ""} ${repair.issue || ""} ${repair.password || ""} ${repair.device || ""}`
  const matches = textToSearch.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{7,11}\b/g)
  if (matches && matches.length > 0) {
    for (const m of matches) {
      const cleanM = m.replace(/\D/g, "")
      if (cleanM.length >= 7 && cleanM.length <= 15) {
        return cleanM
      }
    }
  }

  return ""
}

/**
 * Utility to format device name safely.
 * If brand is "Otro", "Otros", "otro", "otros" (or any case variation),
 * it returns ONLY the model (or fallback device without the word "Otro/Otros").
 */
export function formatDeviceName(brand?: string, model?: string, fallbackDevice?: string): string {
  const cleanBrand = (brand || "").trim()
  const cleanModel = (model || "").trim()
  const isOtherBrand = /^otros?$/i.test(cleanBrand)

  const stripOtros = (str: string) => str.replace(/^otros?\s+/i, "").trim()

  if (isOtherBrand) {
    if (cleanModel) {
      return stripOtros(cleanModel) || "Teléfono"
    }
    if (fallbackDevice) {
      return stripOtros(fallbackDevice) || "Teléfono"
    }
    return "Teléfono"
  }

  if (cleanBrand && cleanModel) {
    const strippedModel = stripOtros(cleanModel)
    return `${cleanBrand} ${strippedModel}`.trim()
  }

  if (cleanBrand) {
    return cleanBrand
  }

  if (cleanModel) {
    const strippedModel = stripOtros(cleanModel)
    return strippedModel || "Teléfono"
  }

  if (fallbackDevice) {
    return stripOtros(fallbackDevice) || "Teléfono"
  }

  return "Teléfono"
}
