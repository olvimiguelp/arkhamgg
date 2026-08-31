import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { createClient } from "./lib/supabase/client"
import "./styles.css"

type Product = {
  id: string
  sku: string
  name: string
  category: string
  stock: number
  sell_price: number
  image_url?: string | null
  image_thumbnail_url?: string | null
}

type Line = Product & { quantity: number }

type CatalogSnapshot = {
  business_name?: string
  categories?: string[]
  products?: Product[]
  has_more?: boolean
}

type CachedCatalogPage = {
  expiresAt: number
  snapshot: CatalogSnapshot
}

type CatalogPageRequest = {
  token: string
  search: string
  category: string
  offset: number
  includeCategories: boolean
}

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2 }).format(value)

const PRODUCTS_PER_PAGE = 24
const SEARCH_DEBOUNCE_MS = 400
const CATALOG_CACHE_TTL_MS = 60 * 1000
const CATALOG_CACHE_PREFIX = "arkham:public-catalog:v2:"

function makeCatalogQueryKey(token: string, search: string, category: string) {
  return JSON.stringify([token, search, category])
}

function makeCatalogCacheKey({ token, search, category, offset }: CatalogPageRequest) {
  return `${CATALOG_CACHE_PREFIX}${JSON.stringify([token, search, category, offset])}`
}

function readCatalogCache(request: CatalogPageRequest): CatalogSnapshot | null {
  try {
    const cacheKey = makeCatalogCacheKey(request)
    const raw = window.sessionStorage.getItem(cacheKey)
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedCatalogPage
    if (!cached?.expiresAt || cached.expiresAt <= Date.now() || !cached.snapshot) {
      window.sessionStorage.removeItem(cacheKey)
      return null
    }
    return cached.snapshot
  } catch {
    return null
  }
}

function writeCatalogCache(request: CatalogPageRequest, snapshot: CatalogSnapshot) {
  try {
    const value: CachedCatalogPage = {
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
      snapshot,
    }
    window.sessionStorage.setItem(makeCatalogCacheKey(request), JSON.stringify(value))
  } catch {
    // El catálogo sigue funcionando aunque el navegador bloquee sessionStorage.
  }
}

function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
  if (!value || typeof value !== "object") return { categories: [], products: [], has_more: false }
  const data = value as Record<string, unknown>
  const categories = Array.isArray(data.categories)
    ? data.categories.filter((category): category is string => typeof category === "string" && Boolean(category.trim()))
    : []
  const products = Array.isArray(data.products)
    ? data.products.filter((product): product is Product => Boolean(product) && typeof product === "object")
    : []

  return {
    business_name: typeof data.business_name === "string" ? data.business_name : undefined,
    categories,
    products,
    has_more: data.has_more === true,
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message
  return fallback
}

async function getCatalogPage(supabase: any, request: CatalogPageRequest, signal?: AbortSignal): Promise<CatalogSnapshot> {
  const cached = readCatalogCache(request)
  if (cached) return cached

  const query = supabase.rpc("get_public_catalog_snapshot", {
    p_token: request.token,
    p_limit: PRODUCTS_PER_PAGE,
    p_offset: request.offset,
    p_search: request.search || null,
    p_category: request.category || null,
    p_include_categories: request.includeCategories,
  })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) throw error

  const snapshot = parseCatalogSnapshot(data)
  writeCatalogCache(request, snapshot)
  return snapshot
}

function CatalogoPublico() {
  const token = new URLSearchParams(window.location.search).get("token") || ""
  const supabase = useMemo(() => createClient(), [])
  const [business, setBusiness] = useState("Catálogo de productos")
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Line[]>([])
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState("")
  const [done, setDone] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [catalogReady, setCatalogReady] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const lastLoadedQueryRef = useRef("")
  const activeQueryRef = useRef("")

  useEffect(() => {
    const controller = new AbortController()
    const defaultQuery = makeCatalogQueryKey(token, "", "")
    activeQueryRef.current = defaultQuery
    lastLoadedQueryRef.current = ""
    setLoading(true)
    setCatalogReady(false)
    setPageLoading(false)
    setProducts([])
    setCategories([])
    setHasMore(false)
    setMessage("")

    if (!token) {
      setMessage("Este enlace no es válido o está desactivado.")
      setLoading(false)
      return () => controller.abort()
    }

    void (async () => {
      try {
        const snapshot = await getCatalogPage(supabase, {
          token,
          search: "",
          category: "",
          offset: 0,
          includeCategories: true,
        }, controller.signal)
        if (controller.signal.aborted) return

        setBusiness(snapshot.business_name || "Catálogo de productos")
        setCategories(snapshot.categories || [])
        setProducts(snapshot.products || [])
        setHasMore(Boolean(snapshot.has_more))
        setCatalogReady(true)
        lastLoadedQueryRef.current = defaultQuery
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(errorMessage(error, "No se pudo cargar el catálogo. Revisa tu conexión e inténtalo nuevamente."))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [supabase, token])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [searchTerm])

  useEffect(() => {
    if (!catalogReady) return
    const search = debouncedSearch.trim()
    const category = selectedCategory === "all" ? "" : selectedCategory
    const queryKey = makeCatalogQueryKey(token, search, category)
    if (lastLoadedQueryRef.current === queryKey) return

    const controller = new AbortController()
    activeQueryRef.current = queryKey
    setPageLoading(true)

    void (async () => {
      try {
        const snapshot = await getCatalogPage(supabase, {
          token,
          search,
          category,
          offset: 0,
          includeCategories: false,
        }, controller.signal)
        if (controller.signal.aborted || activeQueryRef.current !== queryKey) return

        setProducts(snapshot.products || [])
        setHasMore(Boolean(snapshot.has_more))
        lastLoadedQueryRef.current = queryKey
        setMessage("")
      } catch (error) {
        if (!controller.signal.aborted) setMessage(errorMessage(error, "No se pudo cargar el catálogo."))
      } finally {
        if (!controller.signal.aborted) setPageLoading(false)
      }
    })()

    return () => controller.abort()
  }, [catalogReady, debouncedSearch, selectedCategory, supabase, token])

  const loadMore = useCallback(async () => {
    if (!catalogReady || loadingMore || pageLoading || !hasMore) return

    const search = debouncedSearch.trim()
    const category = selectedCategory === "all" ? "" : selectedCategory
    const queryKey = makeCatalogQueryKey(token, search, category)
    const offset = products.length
    setLoadingMore(true)

    try {
      const snapshot = await getCatalogPage(supabase, {
        token,
        search,
        category,
        offset,
        includeCategories: false,
      })
      if (activeQueryRef.current !== queryKey) return

      setProducts((current) => {
        const seen = new Set(current.map((product) => product.id))
        return [...current, ...(snapshot.products || []).filter((product) => !seen.has(product.id))]
      })
      setHasMore(Boolean(snapshot.has_more))
      setMessage("")
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo cargar más productos."))
    } finally {
      setLoadingMore(false)
    }
  }, [catalogReady, debouncedSearch, hasMore, loadingMore, pageLoading, products.length, selectedCategory, supabase, token])

  const add = (product: Product) =>
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      if (found) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item,
        )
      }
      return [...current, { ...product, quantity: 1 }]
    })

  const remove = (id: string) => setCart((current) => current.filter((item) => item.id !== id))
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const total = cart.reduce((sum, item) => sum + Number(item.sell_price) * item.quantity, 0)
  const hasActiveFilters = Boolean(searchTerm.trim()) || selectedCategory !== "all"

  const send = async () => {
    setSending(true)
    setMessage("")
    const { error } = await supabase.rpc("submit_catalog_order", {
      p_token: token,
      p_customer_name: name.trim(),
      p_customer_phone: phone.trim(),
      // El servidor vuelve a comprobar precio y stock; enviar sólo lo que usa
      // reduce la solicitud y evita confiar en datos modificables del navegador.
      p_items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
    })
    setSending(false)
    if (error) setMessage(error.message)
    else {
      setDone(true)
      setCart([])
    }
  }

  if (loading) {
    return <div className="state-screen"><div className="loader" /><p>Cargando catálogo</p></div>
  }

  if (message && !products.length) {
    return <div className="state-screen"><div className="state-card"><span className="state-icon">!</span><h1>Catálogo no disponible</h1><p>{message}</p></div></div>
  }

  if (done) {
    return <div className="state-screen"><div className="state-card"><span className="state-icon success">✓</span><h1>¡Pedido enviado!</h1><p>Recibimos tu selección. El administrador continuará con la facturación.</p></div></div>
  }

  return (
    <div className="catalog-shell">
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-mark">A</div>
          <div className="brand-copy"><span>CATÁLOGO</span><strong>{business}</strong></div>
          <div className="header-cart"><span className="cart-symbol">♧</span><span>{itemCount} {itemCount === 1 ? "artículo" : "artículos"}</span></div>
        </div>
      </header>

      <main className="content-wrap">
        <div className="catalog-filter-row"><label className="product-search"><span>Buscar producto</span><div className="search-input-wrap"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nombre o código del producto" type="search" /><button type="button" onClick={() => setSearchTerm("")} aria-label="Limpiar búsqueda" hidden={!searchTerm}>×</button></div></label><label className="category-filter"><span>Categoría</span><select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}><option value="all">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>

        {pageLoading ? <div className="page-loading"><div className="loader" /><p>Cargando productos...</p></div> : products.length ? (
          <section className="product-grid">
            {products.map((product) => {
              const inCart = cart.find((item) => item.id === product.id)?.quantity || 0
              const gridImageUrl = product.image_thumbnail_url || product.image_url
              return <article className="product-card" key={product.id} onClick={() => setSelectedProduct(product)}>
                <div className="product-image-wrap">
                  {gridImageUrl ? <img src={gridImageUrl} alt={product.name} loading="lazy" decoding="async" onError={(event) => {
                    if (product.image_url && event.currentTarget.dataset.fallback !== "true") {
                      event.currentTarget.dataset.fallback = "true"
                      event.currentTarget.src = product.image_url
                    }
                  }} /> : <div className="image-placeholder"><span>✦</span></div>}
                  {product.category && <span className="category-badge">{product.category}</span>}
                </div>
                <div className="product-info">
                  <h3>{product.name}</h3>
                  <p className="stock-label"><span className="stock-dot" /> {product.stock} disponibles</p>
                  <div className="product-footer"><div><span className="price-label">Precio</span><strong>RD$ {money(Number(product.sell_price))}</strong></div><button className="add-button" onClick={(event) => { event.stopPropagation(); add(product) }}>{inCart ? `Añadir más · ${inCart}` : "Añadir"}<span>＋</span></button></div>
                </div>
              </article>
            })}
          </section>
        ) : <div className="empty-card"><span>⌁</span><h3>{hasActiveFilters ? "No encontramos productos" : "No hay productos disponibles"}</h3><p>{hasActiveFilters ? "Prueba con otro nombre, código o categoría." : "Este catálogo no tiene productos con stock en este momento."}</p></div>}

        {hasMore && <div className="pagination"><button type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más productos"}</button></div>}
      </main>

      <button className="cart-fab" onClick={() => setCartOpen(true)} aria-label="Abrir carrito de compra"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20.5 8H6" /><path d="M9 20h.01M17 20h.01" /></svg>{itemCount > 0 && <span className="fab-count">{itemCount}</span>}</button>

      {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)}>
        <aside className={`cart-panel ${cart.length ? "has-items" : "empty-cart"}`} onClick={(event) => event.stopPropagation()}>
        <div className="cart-header"><div><p className="eyebrow">CARRITO DE COMPRA</p><h2>{cart.length ? "Productos seleccionados" : "Tu carrito está vacío"}</h2></div><div className="cart-header-actions"><span className="cart-badge">{itemCount}</span><button className="cart-close" onClick={() => setCartOpen(false)} aria-label="Cerrar carrito">×</button></div></div>
        {cart.length ? <><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><span>{item.quantity} × RD$ {money(Number(item.sell_price))}</span></div><button className="remove-button" onClick={() => remove(item.id)} aria-label={`Quitar ${item.name}`}>×</button></div>)}</div><div className="cart-total"><span>Total estimado</span><strong>RD$ {money(total)}</strong></div><div className="checkout-form"><input placeholder="Tu nombre" value={name} onChange={(event) => setName(event.target.value)} /><input placeholder="Tu teléfono" value={phone} onChange={(event) => setPhone(event.target.value)} /><button className="submit-button" disabled={sending || !name.trim() || !phone.trim()} onClick={() => void send()}>{sending ? "Enviando pedido…" : "Enviar pedido"}<span>→</span></button></div>{message && <p className="error-message">{message}</p>}</> : <p className="cart-empty-copy">Toca “Añadir” en cualquier producto para verlo aquí.</p>}
        </aside>
      </div>}

      {selectedProduct && <div className="product-modal-backdrop" role="presentation" onClick={() => setSelectedProduct(null)}>
        <div className="product-modal" role="dialog" aria-modal="true" aria-label={selectedProduct.name} onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label="Cerrar">×</button>
          <div className="modal-image">{selectedProduct.image_url || selectedProduct.image_thumbnail_url ? <img src={selectedProduct.image_url || selectedProduct.image_thumbnail_url || ""} alt={selectedProduct.name} /> : <div className="image-placeholder"><span>✦</span></div>}</div>
          <div className="modal-content">{selectedProduct.category && <span className="category-badge">{selectedProduct.category}</span>}<h2>{selectedProduct.name}</h2><p className="stock-label"><span className="stock-dot" /> {selectedProduct.stock} disponibles</p><strong className="modal-price">RD$ {money(Number(selectedProduct.sell_price))}</strong><button className="submit-button modal-add" onClick={() => { add(selectedProduct); setSelectedProduct(null) }}>Añadir al carrito <span>＋</span></button></div>
        </div>
      </div>}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<CatalogoPublico />)
