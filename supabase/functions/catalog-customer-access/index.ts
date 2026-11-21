import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const passwordIterations = 210_000
const sessionLifetimeDays = 30
const encoder = new TextEncoder()

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type RequestBody = {
  action?: string
  actor_id?: string
  actor_password?: string
  name?: string
  email?: string
  phone?: string
  password?: string
  token?: string
  session_token?: string
  customer_id?: string
  customer_phone?: string
  customer_phones?: string[]
  customer_name?: string
  offset?: number
  limit?: number
  search?: string
  category?: string
  include_categories?: boolean
  items?: unknown
}

type StaffActor = {
  id: string
  ownerAdminId: string
}

type CustomerSession = {
  id: string
  name: string
  phone: string
  ownerAdminId: string
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function derivePasswordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: passwordIterations },
    key,
    256,
  )
  return new Uint8Array(derivedBits)
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function requireText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(`${label} es obligatorio`, 400)
  }
  return value
}

async function requireStaff(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
  action: "create" | "overview",
): Promise<StaffActor> {
  const actorId = requireText(body.actor_id, "El usuario empleado")
  const actorPassword = requireText(body.actor_password, "La contraseña del empleado")
  const { data: employee, error } = await supabase
    .from("employees")
    .select("id, owner_admin_id, role, status, password, permissions")
    .eq("id", actorId)
    .maybeSingle()

  if (error) throw new RequestError("No se pudo validar el acceso del empleado", 503)
  if (!employee || employee.status !== "active" || String(employee.password ?? "").trim() !== actorPassword.trim()) {
    throw new RequestError("La sesión del empleado no es válida", 401)
  }

  const permissions =
    employee.permissions && typeof employee.permissions === "object"
      ? employee.permissions as Record<string, unknown>
      : {}
  const isAdmin = employee.role === "admin"
  const hasEmployeePage = isAdmin || permissions.employees === true
  const canCreate = isAdmin || (permissions.employees === true && permissions.canAdd === true)

  if (!hasEmployeePage || (action === "create" && !canCreate)) {
    throw new RequestError("No tienes permiso para administrar usuarios del catálogo", 403)
  }

  const ownerAdminId = isAdmin ? employee.id : employee.owner_admin_id
  if (typeof ownerAdminId !== "string" || !ownerAdminId) {
    throw new RequestError("El empleado no tiene un administrador asignado", 403)
  }

  return { id: employee.id, ownerAdminId }
}

async function requireActiveCatalogShare(supabase: ReturnType<typeof createClient>, token: unknown) {
  const catalogToken = requireText(token, "El enlace del catálogo")
  const { data: share, error } = await supabase
    .from("catalog_shares")
    .select("owner_admin_id, source_table, active, expires_at")
    .eq("token", catalogToken)
    .eq("active", true)
    .maybeSingle()

  if (error) throw new RequestError("No se pudo validar el enlace del catálogo", 503)
  if (
    !share ||
    !["products", "armacen"].includes(share.source_table) ||
    (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())
  ) {
    throw new RequestError("Este enlace no corresponde a un catálogo activo", 404)
  }

  return { token: catalogToken, ownerAdminId: share.owner_admin_id as string }
}

async function resolveCustomerSession(
  supabase: ReturnType<typeof createClient>,
  rawToken: unknown,
): Promise<CustomerSession> {
  const token = requireText(rawToken, "La sesión del cliente")
  const tokenHash = await sha256Hex(token)
  const { data: session, error: sessionError } = await supabase
    .from("catalog_customer_sessions")
    .select("id, customer_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (sessionError) throw new RequestError("No se pudo validar la sesión del cliente", 503)
  if (!session) throw new RequestError("La sesión venció. Inicia sesión nuevamente.", 401)

  const { data: customer, error: customerError } = await supabase
    .from("catalog_customer_accounts")
    .select("id, name, phone, owner_admin_id")
    .eq("id", session.customer_id)
    .eq("is_active", true)
    .maybeSingle()

  if (customerError) throw new RequestError("No se pudo validar la cuenta del cliente", 503)
  if (!customer) throw new RequestError("La cuenta no está disponible", 403)

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    ownerAdminId: customer.owner_admin_id,
  }
}

async function startCustomerSession(
  supabase: ReturnType<typeof createClient>,
  customer: { id: string; name: string; phone: string; owner_admin_id: string },
) {
  const sessionToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = new Date(Date.now() + sessionLifetimeDays * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from("catalog_customer_sessions").insert({
    customer_id: customer.id,
    token_hash: await sha256Hex(sessionToken),
    expires_at: expiresAt,
  })
  if (error) throw new RequestError("No se pudo iniciar la sesión del cliente", 500)

  return {
    session_token: sessionToken,
    expires_at: expiresAt,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      owner_admin_id: customer.owner_admin_id,
    },
  }
}

async function handleRequest(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
) {
  if (body.action === "create") {
    const actor = await requireStaff(supabase, body, "create")
    const name = requireText(body.name, "El nombre")
    const email = requireText(body.email, "El correo").trim().toLowerCase()
    const phone = requireText(body.phone, "El teléfono")
    const password = requireText(body.password, "La contraseña")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("El correo no es válido", 400)
    if (!/^\d{10}$/.test(phone)) throw new RequestError("El teléfono debe tener exactamente 10 dígitos", 400)
    if (password.length < 8) throw new RequestError("La contraseña debe tener al menos 8 caracteres", 400)

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const passwordHash = await derivePasswordHash(password, salt)
    const { data: customer, error } = await supabase
      .from("catalog_customer_accounts")
      .insert({
        owner_admin_id: actor.ownerAdminId,
        name: name.trim(),
        email,
        phone,
        password_salt: bytesToBase64Url(salt),
        password_hash: bytesToBase64Url(passwordHash),
      })
      .select("id, name, email, phone, is_active, created_at")
      .single()

    if (error?.code === "23505") throw new RequestError("Ya existe una cuenta con ese correo o teléfono", 409)
    if (error) throw new RequestError("No se pudo crear la cuenta del catálogo", 500)
    return { customer }
  }

  if (body.action === "overview") {
    const actor = await requireStaff(supabase, body, "overview")
    const customersResult = await supabase
      .from("catalog_customer_accounts")
      .select("id, name, email, phone, is_active, created_at")
      .eq("owner_admin_id", actor.ownerAdminId)
      .order("created_at", { ascending: false })
      .limit(500)

    if (customersResult.error) throw new RequestError("No se pudieron cargar las cuentas del catálogo", 500)

    const buyers = new Map<string, {
      catalog_customer_id: string | null
      customer_name: string
      customer_phone: string
      customer_phones: string[]
      order_count: number
      last_order_at: string
    }>()
    const pageSize = 1000
    const maximumRows = 50_000
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from("catalog_order_history")
        .select("catalog_customer_id, customer_name, customer_phone, created_at")
        .eq("owner_admin_id", actor.ownerAdminId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (error) throw new RequestError("No se pudo cargar el historial del catálogo", 500)
      if (offset >= maximumRows && data.length > 0) {
        throw new RequestError("El historial supera el máximo que se puede cargar en una sola consulta", 413)
      }

      for (const order of data) {
        const normalizedPhone = String(order.customer_phone ?? "").replace(/\D/g, "")
        const customerPhone = String(order.customer_phone ?? "").trim()
        const customerName = String(order.customer_name ?? "").trim()
        const key = normalizedPhone || (order.catalog_customer_id
          ? `account:${order.catalog_customer_id}`
          : `name:${customerName.toLowerCase()}`)
        const buyer = buyers.get(key)

        if (buyer) {
          buyer.order_count += 1
          if (customerPhone && !buyer.customer_phones.includes(customerPhone)) {
            buyer.customer_phones.push(customerPhone)
          }
          if (!buyer.catalog_customer_id && order.catalog_customer_id) {
            buyer.catalog_customer_id = order.catalog_customer_id
          }
        } else {
          buyers.set(key, {
            catalog_customer_id: order.catalog_customer_id,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_phones: customerPhone ? [customerPhone] : [],
            order_count: 1,
            last_order_at: order.created_at,
          })
        }
      }

      if (data.length < pageSize) break
      offset += data.length
    }

    return { customers: customersResult.data, buyers: Array.from(buyers.values()) }
  }

  if (body.action === "history") {
    const actor = await requireStaff(supabase, body, "overview")
    const phone = typeof body.customer_phone === "string" ? body.customer_phone.trim() : ""
    const phoneVariants = Array.isArray(body.customer_phones)
      ? Array.from(new Set(body.customer_phones
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)))
      : []
    const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : ""
    if (phoneVariants.length > 100) {
      throw new RequestError("Hay demasiados formatos de teléfono asociados a este cliente", 400)
    }
    if (!phone && phoneVariants.length === 0 && !customerName) {
      throw new RequestError("Se necesita el teléfono o el nombre del cliente", 400)
    }
    const offset = body.offset ?? 0
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RequestError("La página del historial no es válida", 400)
    }

    const pageSize = 100
    let historyQuery = supabase
      .from("catalog_order_history")
      .select("id, catalog_customer_id, invoice_number, customer_name, customer_phone, items, total, created_at")
      .eq("owner_admin_id", actor.ownerAdminId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize)
    if (phoneVariants.length) {
      historyQuery = historyQuery.in("customer_phone", phoneVariants)
    } else {
      historyQuery = phone
        ? historyQuery.eq("customer_phone", phone)
        : historyQuery.eq("customer_name", customerName)
    }
    const { data, error } = await historyQuery

    if (error) throw new RequestError("No se pudo cargar el historial del cliente", 500)
    const hasMore = data.length > pageSize
    const orders = hasMore ? data.slice(0, pageSize) : data
    return { orders, has_more: hasMore, next_offset: offset + orders.length }
  }

  if (body.action === "login") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    if (!email && !phone) throw new RequestError("El correo o teléfono es obligatorio", 400)
    const password = requireText(body.password, "La contraseña")
    if (!email && !/^\d{10}$/.test(phone)) throw new RequestError("El teléfono debe tener exactamente 10 dígitos", 400)

    let customerQuery = supabase
      .from("catalog_customer_accounts")
      .select("id, name, phone, owner_admin_id, password_salt, password_hash")
      .eq("is_active", true)
    customerQuery = email ? customerQuery.eq("email", email) : customerQuery.eq("phone", phone)
    const { data: customers, error } = await customerQuery

    if (error) throw new RequestError("No se pudo validar la cuenta", 503)
    if (!customers?.length) throw new RequestError("Correo/teléfono o contraseña incorrectos", 401)

    let matchedCustomer: NonNullable<typeof customers>[number] | null = null
    for (const customer of customers) {
      const salt = base64UrlToBytes(customer.password_salt)
      const expectedHash = base64UrlToBytes(customer.password_hash)
      const actualHash = await derivePasswordHash(password, salt)
      if (equalBytes(actualHash, expectedHash)) {
        if (matchedCustomer) {
          throw new RequestError("Hay varias cuentas con ese teléfono y contraseña. Inicia sesión con tu correo.", 409)
        }
        matchedCustomer = customer
      }
    }
    if (!matchedCustomer) throw new RequestError("Correo/teléfono o contraseña incorrectos", 401)

    return await startCustomerSession(supabase, matchedCustomer)
  }

  if (body.action === "session") {
    const customer = await resolveCustomerSession(supabase, body.session_token)
    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        owner_admin_id: customer.ownerAdminId,
      },
    }
  }

  if (body.action === "storefront") {
    const customer = await resolveCustomerSession(supabase, body.session_token)
    const { data: sections, error } = await supabase.rpc("catalog_storefront_sections", {
      p_owner: customer.ownerAdminId,
    })
    if (error) throw new RequestError("No se pudieron cargar las secciones del catálogo", 503)
    return { sections: sections ?? [] }
  }

  if (body.action === "catalog") {
    const share = await requireActiveCatalogShare(supabase, body.token)
    const customer = await resolveCustomerSession(supabase, body.session_token)
    if (customer.ownerAdminId !== share.ownerAdminId) {
      throw new RequestError("Este enlace no pertenece al administrador de tu cuenta", 403)
    }

    const limit = body.limit ?? 24
    const offset = body.offset ?? 0
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RequestError("El límite de productos no es válido", 400)
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 50_000) {
      throw new RequestError("La página solicitada no es válida", 400)
    }
    const search = typeof body.search === "string" ? body.search.trim() : ""
    const category = typeof body.category === "string" ? body.category.trim() : ""
    if (search.length > 200 || category.length > 200) {
      throw new RequestError("El filtro del catálogo es demasiado largo", 400)
    }

    const { data, error } = await supabase.rpc("get_public_catalog_snapshot", {
      p_token: share.token,
      p_limit: limit,
      p_offset: offset,
      p_search: search || null,
      p_category: category || null,
      p_include_categories: body.include_categories === true,
    })
    if (error) throw new RequestError(error.message || "No se pudo cargar el catálogo", 400)
    return { snapshot: data }
  }

  if (body.action === "logout") {
    const token = requireText(body.session_token, "La sesión del cliente")
    const { error } = await supabase
      .from("catalog_customer_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", await sha256Hex(token))
      .is("revoked_at", null)
    if (error) throw new RequestError("No se pudo cerrar la sesión", 500)
    return { logged_out: true }
  }

  if (body.action === "order") {
    const share = await requireActiveCatalogShare(supabase, body.token)
    const customer = await resolveCustomerSession(supabase, body.session_token)
    if (customer.ownerAdminId !== share.ownerAdminId) {
      throw new RequestError("Esta cuenta no pertenece a la empresa del catálogo", 403)
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new RequestError("El carrito está vacío", 400)
    }

    const { data: saleId, error } = await supabase.rpc("submit_catalog_order_for_customer", {
      p_token: share.token,
      p_customer_id: customer.id,
      p_items: body.items,
    })
    if (error) throw new RequestError(error.message || "No se pudo enviar el pedido", 400)
    return { sale_id: saleId }
  }

  throw new RequestError("Acción no válida", 400)
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido" }, 405)
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "La función no está configurada en Supabase" }, 500)
  }

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return jsonResponse({ error: "La solicitud no contiene JSON válido" }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    return jsonResponse(await handleRequest(supabase, body))
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse({ error: error.message }, error.status)
    const message = error instanceof Error ? error.message : "Error desconocido"
    console.error("catalog-customer-access:", message)
    return jsonResponse({ error: "No se pudo completar la operación del catálogo" }, 500)
  }
})
