import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"

export type InventorySourceTable = "products" | "armacen"
export type SaleItemSource = InventorySourceTable | "manual"
export type PaymentMethod = "cash" | "card" | "transfer" | "credit"
export type PaymentRecordKind = "sale" | "debt_payment"

type SourceLikeRecord = {
  id?: unknown
  productId?: unknown
  sourceId?: unknown
  source_id?: unknown
  sourceTable?: unknown
  source_table?: unknown
  boxNumber?: unknown
  box_number?: unknown
  category?: unknown
  productCategory?: unknown
  product_category?: unknown
  sku?: unknown
}

const SOURCE_SEPARATOR = "::"

const readString = (value: unknown) => {
  if (value === undefined || value === null) return ""
  const normalized = String(value).trim()
  return normalized
}

export const normalizePaymentMethod = (value: unknown): PaymentMethod => {
  const normalized = readString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (["card", "tarjeta", "debito", "debito tarjeta", "credito-tarjeta"].includes(normalized)) return "card"
  if (["transfer", "transferencia", "transferencias", "transf", "trafecia"].includes(normalized)) return "transfer"
  if (["credit", "credito", "fiado"].includes(normalized)) return "credit"
  return "cash"
}

export const normalizePaymentRecordKind = (value: unknown): PaymentRecordKind => {
  return readString(value).toLowerCase() === "sale" ? "sale" : "debt_payment"
}

export const normalizeInventorySourceTable = (value: unknown): InventorySourceTable | null => {
  const normalized = readString(value).toLowerCase()
  if (normalized === "armacen" || normalized === "almacen") return "armacen"
  if (normalized === "products" || normalized === "product") return "products"
  return null
}

export const normalizeSaleItemSource = (value: unknown): SaleItemSource | null => {
  const normalizedInventorySource = normalizeInventorySourceTable(value)
  if (normalizedInventorySource) return normalizedInventorySource
  return readString(value).toLowerCase() === "manual" ? "manual" : null
}

export const buildSourceRuntimeId = (sourceTable: SaleItemSource, sourceId: unknown) => {
  const normalizedSourceId = readString(sourceId)
  return `${sourceTable}${SOURCE_SEPARATOR}${normalizedSourceId}`
}

export const parseSourceRuntimeId = (value: unknown): { sourceTable: SaleItemSource; sourceId: string } | null => {
  const normalizedValue = readString(value)
  if (!normalizedValue.includes(SOURCE_SEPARATOR)) return null

  const [rawSourceTable, ...rest] = normalizedValue.split(SOURCE_SEPARATOR)
  const sourceTable = normalizeSaleItemSource(rawSourceTable)
  const sourceId = rest.join(SOURCE_SEPARATOR).trim()

  if (!sourceTable || !sourceId) return null
  return { sourceTable, sourceId }
}

export const looksLikeManualItem = (record?: Partial<SourceLikeRecord> | null) => {
  if (!record) return false
  const explicitSource = normalizeSaleItemSource(record.sourceTable ?? record.source_table)
  if (explicitSource === "manual") return true

  const runtimeSource = parseSourceRuntimeId(record.id)
  if (runtimeSource?.sourceTable === "manual") return true

  const sku = readString(record.sku).toLowerCase()
  const category = readString(record.category ?? record.productCategory ?? record.product_category).toLowerCase()

  return sku === "manual" || category === "manual"
}

export const inferSaleItemSource = (record?: Partial<SourceLikeRecord> | null): SaleItemSource | null => {
  if (!record) return null

  const explicitSource = normalizeSaleItemSource(record.sourceTable ?? record.source_table)
  if (explicitSource) return explicitSource

  const runtimeSource = parseSourceRuntimeId(record.id)
  if (runtimeSource?.sourceTable) return runtimeSource.sourceTable

  if (looksLikeManualItem(record)) return "manual"

  const rawBoxNumber = readString(record.boxNumber ?? record.box_number)
  if (normalizeAlmacenBoxNumber(rawBoxNumber)) return "armacen"

  const rawCategory = readString(record.category ?? record.productCategory ?? record.product_category)
  if (isAlmacenCategory(rawCategory)) return "armacen"

  const sourceId = readString(record.sourceId ?? record.source_id ?? record.productId ?? record.id)
  return sourceId ? "products" : null
}

export const resolveSaleItemSource = (
  record?: Partial<SourceLikeRecord> | null,
  fallbackSource?: SaleItemSource | null,
) => {
  if (!record) return null

  const runtimeSource = parseSourceRuntimeId(record.id)
  const sourceTable =
    normalizeSaleItemSource(record.sourceTable ?? record.source_table) ??
    runtimeSource?.sourceTable ??
    fallbackSource ??
    inferSaleItemSource(record)

  const sourceId =
    readString(record.sourceId ?? record.source_id) ||
    runtimeSource?.sourceId ||
    readString(record.productId) ||
    readString(record.id)

  if (!sourceTable || !sourceId) return null

  return {
    sourceTable,
    sourceId,
    runtimeId: buildSourceRuntimeId(sourceTable, sourceId),
  }
}

export const normalizeRuntimeItemId = (
  record?: Partial<SourceLikeRecord> | null,
  fallbackSource?: SaleItemSource | null,
) => {
  const resolved = resolveSaleItemSource(record, fallbackSource)
  if (resolved) return resolved.runtimeId
  return readString(record?.id)
}

export const isAlmacenSourceRecord = (
  record?: Partial<SourceLikeRecord> | null,
  almacenSourceIds?: Set<string>,
  fallbackSource?: SaleItemSource | null,
) => {
  if (!record) return false

  const resolved = resolveSaleItemSource(record, fallbackSource)
  if (resolved?.sourceTable === "armacen") return true

  if (resolved?.sourceId && almacenSourceIds?.has(buildSourceRuntimeId("armacen", resolved.sourceId))) {
    return true
  }

  const rawId = readString(record.productId ?? record.id)
  if (rawId && almacenSourceIds) {
    if (almacenSourceIds.has(rawId) || almacenSourceIds.has(buildSourceRuntimeId("armacen", rawId))) {
      return true
    }
  }

  const rawBoxNumber = readString(record.boxNumber ?? record.box_number)
  if (normalizeAlmacenBoxNumber(rawBoxNumber)) return true

  const rawCategory = readString(record.category ?? record.productCategory ?? record.product_category)
  return isAlmacenCategory(rawCategory)
}

export const sameSaleItemSource = (
  left?: Partial<SourceLikeRecord> | null,
  right?: Partial<SourceLikeRecord> | null,
  fallbackSource?: SaleItemSource | null,
) => {
  const leftResolved = resolveSaleItemSource(left, fallbackSource)
  const rightResolved = resolveSaleItemSource(right, fallbackSource)

  if (!leftResolved || !rightResolved) return false
  return leftResolved.sourceTable === rightResolved.sourceTable && leftResolved.sourceId === rightResolved.sourceId
}
