import { useEffect, useMemo, useState } from "react"
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
  wholesale_price: number
  image_url?: string
}

type Line = Product & { quantity: number }

const money = (value: number) =>
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2 }).format(value)

function CatalogoPublico() {
  const token = new URLSearchParams(window.location.search).get("token") || ""
  const supabase = useMemo(() => createClient(), [])
  const [business, setBusiness] = useState("Catálogo de productos")
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Line[]>([])
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState("")
  const [done, setDone] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data: share } = await supabase
        .from("catalog_shares")
        .select("owner_admin_id, product_ids, business_name, price_mode, active, expires_at")
        .eq("token", token)
        .maybeSingle()

      if (!share || !share.active || (share.expires_at && new Date(share.expires_at) < new Date())) {
        setMessage("Este enlace no es válido o ha vencido.")
        setLoading(false)
        return
      }

      setBusiness(share.business_name || "Catálogo de productos")
      const isWholesale = share.price_mode === "wholesale"
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, category, stock, sell_price, wholesale_price, image_url")
        .eq("owner_admin_id", share.owner_admin_id)
        .in("id", share.product_ids || [])
        .gt("stock", 0)
        .gt(isWholesale ? "wholesale_price" : "sell_price", 0)
        .order("name")

      setProducts((data || []).map((product) => isWholesale ? { ...product, sell_price: product.wholesale_price } : product))
      setLoading(false)
    })()
  }, [supabase, token])

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

  const send = async () => {
    setSending(true)
    setMessage("")
    const { error } = await supabase.rpc("submit_catalog_order", {
      p_token: token,
      p_customer_name: name.trim(),
      p_customer_phone: phone.trim(),
      p_items: cart.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        sellPrice: Number(item.sell_price),
        stock: item.stock,
        quantity: item.quantity,
        sourceTable: "products",
        sourceId: item.id,
        cartId: item.id,
      })),
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
        <div className="catalog-toolbar"><div><p className="eyebrow">CATÁLOGO</p><h1>Todos los productos</h1></div><div className="product-count"><strong>{products.length}</strong><span>disponibles</span></div></div>

        {products.length ? (
          <section className="product-grid">
            {products.map((product) => {
              const inCart = cart.find((item) => item.id === product.id)?.quantity || 0
              return <article className="product-card" key={product.id} onClick={() => setSelectedProduct(product)}>
                <div className="product-image-wrap">
                  {product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="image-placeholder"><span>✦</span></div>}
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
        ) : <div className="empty-card"><span>⌁</span><h3>No hay productos disponibles</h3><p>Este catálogo no tiene productos con stock en este momento.</p></div>}
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
          <div className="modal-image">{selectedProduct.image_url ? <img src={selectedProduct.image_url} alt={selectedProduct.name} /> : <div className="image-placeholder"><span>✦</span></div>}</div>
          <div className="modal-content">{selectedProduct.category && <span className="category-badge">{selectedProduct.category}</span>}<h2>{selectedProduct.name}</h2><p className="stock-label"><span className="stock-dot" /> {selectedProduct.stock} disponibles</p><strong className="modal-price">RD$ {money(Number(selectedProduct.sell_price))}</strong><button className="submit-button modal-add" onClick={() => { add(selectedProduct); setSelectedProduct(null) }}>Añadir al carrito <span>＋</span></button></div>
        </div>
      </div>}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<CatalogoPublico />)
