import React, { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { createClient } from "../../src/lib/supabase/client"
import "./styles.css"

type Product = { id: string; sku: string; name: string; category: string; stock: number; sell_price: number; image_url?: string }
type Line = Product & { quantity: number }
const money = (value: number) => new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2 }).format(value)

function CatalogoPublico() {
  const token = new URLSearchParams(window.location.search).get("token") || ""
  const supabase = useMemo(() => createClient(), [])
  const [business, setBusiness] = useState("Catálogo de productos")
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Line[]>([])
  const [name, setName] = useState(""); const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(""); const [done, setDone] = useState(false)

  useEffect(() => { (async () => {
    const { data: share } = await supabase.from("catalog_shares").select("owner_admin_id, product_ids, business_name, active, expires_at").eq("token", token).maybeSingle()
    if (!share || !share.active || (share.expires_at && new Date(share.expires_at) < new Date())) { setMessage("Este enlace no es válido o ha vencido."); setLoading(false); return }
    setBusiness(share.business_name || "Catálogo de productos")
    const { data } = await supabase.from("products").select("id, sku, name, category, stock, sell_price, image_url").eq("owner_admin_id", share.owner_admin_id).in("id", share.product_ids || []).gt("stock", 0).order("name")
    setProducts(data || []); setLoading(false)
  })() }, [supabase, token])

  const add = (product: Product) => setCart(current => { const found = current.find(x => x.id === product.id); return found ? current.map(x => x.id === product.id ? { ...x, quantity: Math.min(x.quantity + 1, product.stock) } : x) : [...current, { ...product, quantity: 1 }] })
  const total = cart.reduce((sum, item) => sum + Number(item.sell_price) * item.quantity, 0)
  const send = async () => { setSending(true); setMessage(""); const { error } = await supabase.rpc("submit_catalog_order", { p_token: token, p_customer_name: name.trim(), p_customer_phone: phone.trim(), p_items: cart.map(x => ({ id: x.id, sku: x.sku, name: x.name, category: x.category, sellPrice: Number(x.sell_price), stock: x.stock, quantity: x.quantity, sourceTable: "products", sourceId: x.id, cartId: x.id })) }); setSending(false); if (error) setMessage(error.message); else { setDone(true); setCart([]) } }

  if (loading) return <div className="center">Cargando catálogo…</div>
  if (message && !products.length) return <div className="center"><div className="panel"><h1>Catálogo no disponible</h1><p>{message}</p></div></div>
  if (done) return <div className="center"><div className="panel"><h1>✓ Pedido enviado</h1><p>El administrador recibió tu selección y continuará con la facturación.</p></div></div>
  return <main><header><div><small>CATÁLOGO COMPARTIDO</small><h1>{business}</h1><p>Selecciona los productos disponibles</p></div><strong>🛒 {cart.reduce((sum, x) => sum + x.quantity, 0)}</strong></header><section className="grid">{products.map(product => <article className="product" key={product.id}>{product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="placeholder">Producto</div>}<small>{product.category}</small><h2>{product.name}</h2><b>RD$ {money(Number(product.sell_price))}</b><p>Disponible: {product.stock}</p><button onClick={() => add(product)}>Agregar al carrito</button></article>)}</section>{!products.length && <p className="empty">No hay productos disponibles.</p>}{cart.length > 0 && <aside><div className="cart-lines">{cart.map(item => <span key={item.id}>{item.name} × {item.quantity} <button onClick={() => setCart(cart.filter(x => x.id !== item.id))}>Quitar</button></span>)}</div><div className="checkout"><input placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} /><input placeholder="Tu teléfono" value={phone} onChange={e => setPhone(e.target.value)} /><b>Total RD$ {money(total)}</b><button disabled={sending || !name.trim() || !phone.trim()} onClick={() => void send()}>{sending ? "Enviando…" : "Enviar selección"}</button></div>{message && <p className="error">{message}</p>}</aside>}</main>
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><CatalogoPublico /></React.StrictMode>)
