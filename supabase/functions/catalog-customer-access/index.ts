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
  phone?: string
  password?: string
  token?: string
  session_token?: string
  customer_id?: string
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

async function requireWarehouseShare(supabase: ReturnType<typeof createClient>, token: unknown) {
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
    share.source_table !== "armacen" ||
    (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())
  ) {
    throw new RequestError("Este enlace no corresponde a un catálogo de almacén activo", 404)
  }

  return { token: catalogToken, ownerAdminId: share.owner_admin_id as string }
}

async function resolveCustomerSession(
  supabase: ReturnType<typeof createClient>,
  rawToken: unknown,
  ownerAdminId: string,
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
    .select("id, name, phone")
    .eq("id", session.customer_id)
    .eq("owner_admin_id", ownerAdminId)
    .eq("is_active", true)
    .maybeSingle()

  if (customerError) throw new RequestError("No se pudo validar la cuenta del cliente", 503)
  if (!customer) throw new RequestError("La cuenta no está disponible para este catálogo", 403)

  return { id: customer.id, name: customer.name, phone: customer.phone }
}

async function handleRequest(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
) {
  if (body.action === "create") {
    const actor = await requireStaff(supabase, body, "create")
    const name = requireText(body.name, "El nombre")
    const phone = requireText(body.phone, "El teléfono")
    const password = requireText(body.password, "La contraseña")
    if (!/^\d{10}$/.test(phone)) throw new RequestError("El teléfono debe tener exactamente 10 dígitos", 400)
    if (password.length < 8) throw new RequestError("La contraseña debe tener al menos 8 caracteres", 400)

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const passwordHash = await derivePasswordHash(password, salt)
    const { data: customer, error } = await supabase
      .from("catalog_customer_accounts")
      .insert({
        owner_admin_id: actor.ownerAdminId,
        name: name.trim(),
        phone,
        password_salt: bytesToBase64Url(salt),
        password_hash: bytesToBase64Url(passwordHash),
      })
      .select("id, name, phone, is_active, created_at")
      .single()

    if (error?.code === "23505") throw new RequestError("Ya existe una cuenta con ese teléfono", 409)
    if (error) throw new RequestError("No se pudo crear la cuenta del catálogo", 500)
    return { customer }
  }

  if (body.action === "overview") {
    const actor = await requireStaff(supabase, body, "overview")
    const [customersResult, historyResult] = await Promise.all([
      supabase
        .from("catalog_customer_accounts")
        .select("id, name, phone, is_active, created_at")
        .eq("owner_admin_id", actor.ownerAdminId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("catalog_order_history")
        .select("id, catalog_customer_id, invoice_number, customer_name, customer_phone, items, total, created_at")
        .eq("owner_admin_id", actor.ownerAdminId)
        .order("created_at", { ascending: false })
        .limit(100),
    ])

    if (customersResult.error) throw new RequestError("No se pudieron cargar las cuentas del catálogo", 500)
    if (historyResult.error) throw new RequestError("No se pudo cargar el historial del catálogo", 500)
    return { customers: customersResult.data, orders: historyResult.data }
  }

  if (body.action === "login") {
    const share = await requireWarehouseShare(supabase, body.token)
    const phone = requireText(body.phone, "El teléfono")
    const password = requireText(body.password, "La contraseña")
    if (!/^\d{10}$/.test(phone)) throw new RequestError("El teléfono debe tener exactamente 10 dígitos", 400)

    const { data: customer, error } = await supabase
      .from("catalog_customer_accounts")
      .select("id, name, phone, password_salt, password_hash")
      .eq("owner_admin_id", share.ownerAdminId)
      .eq("phone", phone)
      .eq("is_active", true)
      .maybeSingle()

    if (error) throw new RequestError("No se pudo validar la cuenta", 503)
    if (!customer) throw new RequestError("Teléfono o contraseña incorrectos", 401)

    const salt = base64UrlToBytes(customer.password_salt)
    const expectedHash = base64UrlToBytes(customer.password_hash)
    const actualHash = await derivePasswordHash(password, salt)
    if (!equalBytes(actualHash, expectedHash)) {
      throw new RequestError("Teléfono o contraseña incorrectos", 401)
    }

    const sessionToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
    const expiresAt = new Date(Date.now() + sessionLifetimeDays * 24 * 60 * 60 * 1000).toISOString()
    const { error: sessionError } = await supabase.from("catalog_customer_sessions").insert({
      customer_id: customer.id,
      token_hash: await sha256Hex(sessionToken),
      expires_at: expiresAt,
    })
    if (sessionError) throw new RequestError("No se pudo iniciar la sesión del cliente", 500)

    return {
      session_token: sessionToken,
      expires_at: expiresAt,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    }
  }

  if (body.action === "session") {
    const share = await requireWarehouseShare(supabase, body.token)
    const customer = await resolveCustomerSession(supabase, body.session_token, share.ownerAdminId)
    return { customer }
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
    const share = await requireWarehouseShare(supabase, body.token)
    const customer = await resolveCustomerSession(supabase, body.session_token, share.ownerAdminId)
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
