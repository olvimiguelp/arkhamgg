import { createClient } from "@/lib/supabase/client"

export interface CustomerImportData {
  name: string
  cedula?: string
  phone?: string
  email?: string
  address?: string
  status?: string
  creditDevice?: string
  notes?: string
  debt?: number
  totalPurchases?: number
  creditBalance?: number
  creditLimit?: number
}

/**
 * Parsea un archivo CSV y extrae los datos del cliente
 * @param csvContent Contenido del archivo CSV
 * @returns Array de datos de clientes
 */
export function parseCSV(csvContent: string): CustomerImportData[] {
  const lines = csvContent.trim().split("\n")
  if (lines.length === 0) return []

  // Primera línea son los headers
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())

  const customers: CustomerImportData[] = []

  // Procesar cada fila
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const customerData: CustomerImportData = {
      name: "",
    }

    // Mapear valores a propiedades del cliente
    headers.forEach((header, index) => {
      const value = values[index]?.trim() || ""

      switch (header) {
        case "name":
        case "nombre":
          customerData.name = value
          break
        case "cedula":
        case "cédula":
        case "id_number":
          customerData.cedula = value
          break
        case "phone":
        case "telefono":
        case "teléfono":
          customerData.phone = value
          break
        case "email":
        case "correo":
          customerData.email = value
          break
        case "address":
        case "direccion":
        case "dirección":
          customerData.address = value
          break
        case "status":
        case "estado":
          customerData.status = value || "En proceso"
          break
        case "credit_device":
        case "creditdevice":
        case "dispositivo_credito":
          customerData.creditDevice = value
          break
        case "notes":
        case "notas":
        case "comentarios":
          customerData.notes = value
          break
        case "debt":
        case "deuda":
          customerData.debt = parseFloat(value) || 0
          break
        case "total_purchases":
        case "totalpurchases":
        case "compras_totales":
          customerData.totalPurchases = parseFloat(value) || 0
          break
        case "credit_balance":
        case "creditbalance":
        case "saldo_credito":
          customerData.creditBalance = parseFloat(value) || 0
          break
        case "credit_limit":
        case "creditlimit":
        case "limite_credito":
          customerData.creditLimit = parseFloat(value) || 0
          break
      }
    })

    if (customerData.name) {
      customers.push(customerData)
    }
  }

  return customers
}

/**
 * Parsea un CSV genérico y devuelve un array de registros { header: value }
 */
export function parseGenericCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.trim().split(/\r?\n/)
  if (lines.length === 0) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.trim())
  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h.toLowerCase()] = (values[idx] || "").trim()
    })
    rows.push(row)
  }

  return rows
}

/**
 * Parsea una línea CSV respetando comillas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/**
 * Parsea un archivo SQL INSERT y extrae los datos del cliente
 * @param sqlContent Contenido del archivo SQL
 * @returns Array de datos de clientes
 */
export function parseSQL(sqlContent: string): CustomerImportData[] {
  const customers: CustomerImportData[] = []

  // Regex para encontrar INSERTs en (opcional) esquema + tabla customers, más robusto ante comillas y saltos de línea
  const insertRegex = /INSERT\s+INTO\s+(?:["'`]?\w+["'`]?\.)?["'`]?customers["'`]?[\s\S]*?VALUES\s*(\([^\)]*\)(?:\s*,\s*\([^\)]*\))*)/gi

  let match
  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const valuesSection = match[1]
    const rowRegex = /\(([^)]+)\)/g

    let rowMatch
    while ((rowMatch = rowRegex.exec(valuesSection)) !== null) {
      const values = rowMatch[1]
      const customerData = parseSQLRow(values)
      if (customerData.name) {
        customers.push(customerData)
      }
    }
  }

  return customers
}

/**
 * Parsea una fila SQL y extrae los valores
 */
function parseSQLRow(rowStr: string): CustomerImportData {
  const values = parseSQLValues(rowStr)
  const customerData: CustomerImportData = {
    name: "",
  }

  // Mapeo de columnas en orden típico
  const columnOrder = [
    "id",
    "tenant_id",
    "name",
    "cedula",
    "phone",
    "email",
    "address",
    "status",
    "credit_device",
    "notes",
    "debt",
    "total_purchases",
    "credit_balance",
    "credit_limit",
    "reminder_enabled",
    "reminder_interval_days",
    "reminder_message",
    "reminder_last_sent_at",
    "created_at",
    "updated_at",
  ]

  values.forEach((value, index) => {
    const column = columnOrder[index]?.toLowerCase() || ""

    switch (column) {
      case "name":
      case "nombre":
        customerData.name = value
        break
      case "cedula":
        customerData.cedula = value
        break
      case "phone":
      case "telefono":
        customerData.phone = value
        break
      case "email":
      case "correo":
        customerData.email = value
        break
      case "address":
      case "direccion":
        customerData.address = value
        break
      case "status":
      case "estado":
        customerData.status = value || "En proceso"
        break
      case "credit_device":
        customerData.creditDevice = value
        break
      case "notes":
      case "notas":
        customerData.notes = value
        break
      case "debt":
      case "deuda":
        customerData.debt = parseFloat(value) || 0
        break
      case "total_purchases":
      case "compras_totales":
        customerData.totalPurchases = parseFloat(value) || 0
        break
      case "credit_balance":
      case "saldo_credito":
        customerData.creditBalance = parseFloat(value) || 0
        break
      case "credit_limit":
      case "limite_credito":
        customerData.creditLimit = parseFloat(value) || 0
        break
    }
  })

  return customerData
}

/**
 * Parsea valores SQL respetando comillas y NULL
 */
function parseSQLValues(valueStr: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < valueStr.length; i++) {
    const char = valueStr[i]
    const nextChar = valueStr[i + 1]

    if (char === "'") {
      if (inQuotes && nextChar === "'") {
        current += "'"
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      const trimmed = current.trim()
      values.push(trimmed === "NULL" ? "" : trimmed.replace(/^'|'$/g, ""))
      current = ""
    } else {
      current += char
    }
  }

  const trimmed = current.trim()
  values.push(trimmed === "NULL" ? "" : trimmed.replace(/^'|'$/g, ""))
  return values
}

/**
 * Importa clientes a la base de datos
 */
export async function importCustomersToDatabase(
  customers: CustomerImportData[],
  tenantId: string,
  withTenantPayload: (payload: any) => any,
) {
  const supabase = createClient()
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const customer of customers) {
    try {
      const { error } = await supabase.from("customers").insert(
        withTenantPayload({
          id: crypto.randomUUID(),
          name: customer.name,
          cedula: customer.cedula || "",
          phone: customer.phone || "",
          email: customer.email || "",
          address: customer.address || "",
          status: customer.status || "En proceso",
          credit_device: customer.creditDevice || "",
          notes: customer.notes || "",
          debt: customer.debt || 0,
          total_purchases: customer.totalPurchases || 0,
          credit_balance: customer.creditBalance || 0,
          credit_limit: customer.creditLimit || 0,
          reminder_enabled: false,
          reminder_interval_days: 15,
          reminder_message: null,
        }),
      )

      if (error) {
        results.failed++
        results.errors.push(`Error al importar "${customer.name}": ${error.message}`)
      } else {
        results.success++
      }
    } catch (err) {
      results.failed++
      results.errors.push(`Error al importar "${customer.name}": ${String(err)}`)
    }
  }

  return results
}
