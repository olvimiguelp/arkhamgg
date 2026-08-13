export type AlmacenCategory =
  | "flex"
  | "pantallas"
  | "baterias"
  | "camara"
  | "bosinas"
  | "botones"
  | "housing"
  | "tapas"
  | "otros"

type AlmacenCategoryConfig = {
  label: string
  skuStart: number
  skuEndExclusive: number
  aliases?: string[]
  visibleInSelector?: boolean
}

export const ALMACEN_CATEGORY_CONFIG: Record<AlmacenCategory, AlmacenCategoryConfig> = {
  flex: {
    label: "Flex",
    skuStart: 1,
    skuEndExclusive: 10000,
    aliases: ["flash", "flesh"],
    visibleInSelector: true,
  },
  pantallas: {
    label: "Pantallas",
    skuStart: 10000,
    skuEndExclusive: 20000,
    aliases: ["pantalla"],
    visibleInSelector: true,
  },
  baterias: {
    label: "Baterias",
    skuStart: 20000,
    skuEndExclusive: 30000,
    aliases: ["bateria"],
    visibleInSelector: true,
  },
  camara: {
    label: "Camara",
    skuStart: 40000,
    skuEndExclusive: 50000,
    aliases: ["camaras", "camera", "cameras"],
    visibleInSelector: true,
  },
  bosinas: {
    label: "Bosinas",
    skuStart: 50000,
    skuEndExclusive: 60000,
    aliases: ["bosina", "bocina", "bocinas", "speaker", "speakers"],
    visibleInSelector: true,
  },
  botones: {
    label: "Botones",
    skuStart: 60000,
    skuEndExclusive: 70000,
    aliases: ["boton"],
    visibleInSelector: true,
  },
  housing: {
    label: "Housing",
    skuStart: 70000,
    skuEndExclusive: 80000,
    aliases: ["haising", "housings"],
    visibleInSelector: true,
  },
  tapas: {
    label: "Tapas",
    skuStart: 30000,
    skuEndExclusive: 40000,
    aliases: ["tapa"],
    visibleInSelector: true,
  },
  otros: {
    label: "Otros",
    skuStart: 80000,
    skuEndExclusive: 90000,
    aliases: ["otro"],
    visibleInSelector: true,
  },
}

export const ALMACEN_CATEGORY_OPTIONS = (Object.entries(ALMACEN_CATEGORY_CONFIG) as Array<
  [AlmacenCategory, AlmacenCategoryConfig]
>)
  .filter(([, config]) => config.visibleInSelector !== false)
  .map(([value, config]) => ({
    value,
    label: config.label,
  }))

type ProductWithSkuAndCategory = {
  id?: string | null
  sku?: string | null
  category?: string | null
}

const normalizeText = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const getKnownAlmacenCategory = (value?: string | null): AlmacenCategory | null => {
  const normalized = normalizeText(value)
  if (!normalized) return null

  for (const [key, config] of Object.entries(ALMACEN_CATEGORY_CONFIG) as Array<
    [AlmacenCategory, AlmacenCategoryConfig]
  >) {
    if (normalized === key) return key
    if ((config.aliases || []).includes(normalized)) return key
  }

  return null
}

const getAlmacenSkuBucket = (value?: string | null): AlmacenCategory | null => {
  const knownCategory = getKnownAlmacenCategory(value)
  if (knownCategory) return knownCategory

  return normalizeText(value) ? "otros" : null
}

const parseNumericSku = (value?: string | null) => {
  const trimmedValue = (value || "").trim()
  if (!/^\d+$/.test(trimmedValue)) return null

  const parsedValue = Number.parseInt(trimmedValue, 10)
  return Number.isInteger(parsedValue) ? parsedValue : null
}

export const formatAlmacenSku = (value?: string | number | null) => {
  const parsedSku = parseNumericSku(value == null ? "" : String(value))
  if (parsedSku === null) return (value == null ? "" : String(value)).trim()
  return String(parsedSku).padStart(5, "0")
}

export const normalizeAlmacenCategory = (value?: string | null): AlmacenCategory | null => getKnownAlmacenCategory(value)

const LEGACY_ALMACEN_CATEGORY_KEYS: AlmacenCategory[] = ["flex", "pantallas", "baterias", "tapas"]

export const isAlmacenCategory = (value?: string | null): value is AlmacenCategory =>
  (() => {
    const normalizedCategory = normalizeAlmacenCategory(value)
    return normalizedCategory ? LEGACY_ALMACEN_CATEGORY_KEYS.includes(normalizedCategory) : false
  })()

export const getAlmacenCategoryLabel = (value?: string | null) => {
  const trimmedValue = (value || "").trim()
  if (!trimmedValue) return "Sin categoria"

  const category = normalizeAlmacenCategory(trimmedValue)
  return category ? ALMACEN_CATEGORY_CONFIG[category].label : trimmedValue
}

export const getAlmacenCategoryRangeLabel = (value?: string | null) => {
  const category = getAlmacenSkuBucket(value)
  if (!category) return ""

  const config = ALMACEN_CATEGORY_CONFIG[category]
  return `${formatAlmacenSku(config.skuStart)} - ${formatAlmacenSku(config.skuEndExclusive - 1)}`
}

export const getAlmacenCategoryFilterValue = (value?: string | null) => {
  const category = normalizeAlmacenCategory(value)
  if (category) return category

  return normalizeText(value)
}

export const isSkuInsideAlmacenRange = (sku: string, category: string) => {
  const normalizedCategory = getAlmacenSkuBucket(category)
  if (!normalizedCategory) return false

  const parsedSku = parseNumericSku(sku)
  if (parsedSku === null) return false

  const config = ALMACEN_CATEGORY_CONFIG[normalizedCategory]
  return parsedSku >= config.skuStart && parsedSku < config.skuEndExclusive
}

export const getNextAlmacenSku = (
  products: ProductWithSkuAndCategory[],
  category: string,
  currentProductId?: string | null,
) => {
  const normalizedCategory = getAlmacenSkuBucket(category)
  if (!normalizedCategory) return null

  const config = ALMACEN_CATEGORY_CONFIG[normalizedCategory]
  const usedSkus = new Set<number>(
    products
      .filter((product) => product.id !== currentProductId)
      .map((product) => parseNumericSku(product.sku))
      .filter((sku): sku is number => sku !== null)
      .filter((sku) => sku >= config.skuStart && sku < config.skuEndExclusive),
  )

  for (let candidate = config.skuStart; candidate < config.skuEndExclusive; candidate += 1) {
    if (!usedSkus.has(candidate)) {
      return formatAlmacenSku(candidate)
    }
  }

  return null
}

export const getTramoCode = (position: number) => {
  return normalizeAlmacenBoxNumber(String(position))
}

export const normalizeAlmacenBoxNumber = (value?: string | null) => {
  const digitsOnly = String(value || "").replace(/\D/g, "")
  return digitsOnly.replace(/^0+(?=\d)/, "")
}

export const isValidAlmacenBoxNumber = (value?: string | null) =>
  /^\d+$/.test(normalizeAlmacenBoxNumber(value))

export const compareAlmacenBoxNumbers = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeAlmacenBoxNumber(left)
  const normalizedRight = normalizeAlmacenBoxNumber(right)

  if (!normalizedLeft && !normalizedRight) return 0
  if (!normalizedLeft) return 1
  if (!normalizedRight) return -1

  const leftNumber = Number.parseInt(normalizedLeft, 10)
  const rightNumber = Number.parseInt(normalizedRight, 10)

  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }

  return normalizedLeft.localeCompare(normalizedRight, undefined, { numeric: true })
}

export const buildAlmacenInternalSku = ({
  products,
  category,
  currentProductId,
  preferredSku,
}: {
  products: ProductWithSkuAndCategory[]
  category?: string | null
  currentProductId?: string | null
  preferredSku?: string | null
}) => {
  const normalizedCategory = getAlmacenSkuBucket(category)
  if (!normalizedCategory) return null

  if (preferredSku && isSkuInsideAlmacenRange(preferredSku, normalizedCategory)) {
    return formatAlmacenSku(preferredSku)
  }

  return getNextAlmacenSku(products, normalizedCategory, currentProductId)
}

export const formatAlmacenSaleItemName = ({
  name,
  boxNumber,
  category,
}: {
  name?: string | null
  boxNumber?: string | null
  category?: string | null
}) => {
  const normalizedName = (name || "").trim()
  const normalizedBox = normalizeAlmacenBoxNumber(boxNumber)

  if (normalizedBox) {
    return `Caja ${normalizedBox} - ${normalizedName}`
  }

  return normalizedName
}
