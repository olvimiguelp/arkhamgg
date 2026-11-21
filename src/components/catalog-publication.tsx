import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { PUBLIC_CATALOG_URL } from "@/lib/public-catalog-url"

const kinds = ["normal", "wholesale", "warehouse"] as const
type Kind = (typeof kinds)[number]
const labels = { normal: "Catálogo normal", wholesale: "Catálogo por mayor", warehouse: "Almacén" }
type Scope = { mode: "hidden" | "all" | "selected"; categories: string[] }
type Option = { value: string; label: string }
type Props = {
  isAdmin: boolean
  customerId?: string
  ownerId: string
  credentials: () => { actor_id: string; actor_password: string }
  warehouse: Option[]
  products: Option[]
}
function initialScopes(): Record<Kind, Scope> {
  return {
    normal: { mode: "hidden", categories: [] },
    wholesale: { mode: "hidden", categories: [] },
    warehouse: { mode: "hidden", categories: [] },
  }
}

function CategoryChoices({
  options,
  selected,
  change,
}: {
  options: Option[]
  selected: string[]
  change: (v: string[]) => void
}) {
  const names = new Map(options.map((o) => [o.value, o.label]))
  for (const name of selected) if (!names.has(name)) names.set(name, name)
  const availableSelected = selected
  return (
    <div className="grid gap-2 py-2">
      {Array.from(names, ([value, label]) => (
        <label className="flex items-center gap-2" key={value}>
          <input
            type="checkbox"
            checked={availableSelected.includes(value)}
            onChange={(e) =>
              change(e.target.checked ? [...availableSelected, value] : availableSelected.filter((n) => n !== value))
            }
          />
          {label}
        </label>
      ))}
    </div>
  )
}

export function CatalogPublication({ isAdmin, ownerId, credentials, warehouse, products, customerId }: Props) {
  const [tab, setTab] = useState<"customer" | "home">(customerId ? "home" : "customer")
  const [scopes, setScopes] = useState(initialScopes)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const options = (k: Kind) => (k === "warehouse" ? warehouse : products)
  useEffect(() => {
    if (tab !== "home") return
    let current = true
    setLoaded(false)
    void (async () => {
      try {
        const db = createClient()
        const { data, error } = customerId
          ? await db.rpc("account_catalog_settings", { ...credentials(), p_customer: customerId })
          : await db.rpc("catalog_storefront_sections", { p_owner: ownerId })
        if (error) throw new Error(error.message)
        const next = initialScopes()
        for (const row of data as { kind: Kind; categories: string[] }[]) {
          next[row.kind] = { mode: row.categories.length ? "selected" : "all", categories: row.categories }
        }
        if (current) {
          setScopes(next)
          setLoaded(true)
        }
      } catch (error) {
        if (current) setMessage(error instanceof Error ? error.message : "No se pudo cargar la portada.")
      }
    })()
    return () => {
      current = false
    }
  }, [tab, ownerId, customerId])

  async function submit() {
    setBusy(true)
    setMessage("")
    try {
      const db = createClient()
      const actor = credentials()
      if (tab === "home") {
        const rules = Object.fromEntries(
          kinds.map((k) => [
            k,
            scopes[k].mode === "hidden"
              ? null
              : scopes[k].mode === "all"
                ? []
                : scopes[k].categories,
          ]),
        )
        const { error } = customerId
          ? await db.rpc("account_catalog_settings", { ...actor, p_customer: customerId, p_sections: rules })
          : await db.rpc("save_catalog_storefront", { ...actor, p_sections: rules })
        if (error) throw new Error(error.message)
        setMessage(customerId ? "Acceso de la cuenta guardado." : "Portada guardada.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el catálogo.")
    } finally {
      setBusy(false)
    }
  }

  const unavailable = !loaded || kinds.some((k) => scopes[k].mode === "selected" && !scopes[k].categories.length)
  return (
    <fieldset disabled={busy} className="grid gap-4">
      {!customerId && <div className="flex flex-wrap gap-2">
        {(["customer", "home"] as const)
          .filter((v) => v === "customer" || isAdmin)
          .map((v) => (
            <Button
              key={v}
              variant={tab === v ? "default" : "outline"}
              onClick={() => {
                setTab(v)
                setMessage("")
              }}
            >
              {v === "home" ? "Portada pública" : "Dirección de acceso"}
            </Button>
          ))}
      </div>}
      {tab === "home" && loaded && (
        <>
          <label>
            <input
              type="checkbox"
              checked={kinds.every((k) => scopes[k].mode === "all")}
              onChange={(e) => {
                const next = initialScopes()
                if (e.target.checked) for (const k of kinds) next[k].mode = "all"
                setScopes(next)
              }}
            />{" "}
            Mostrar todos los catálogos y categorías
          </label>
          {kinds.map((k) => (
            <div key={k} className="grid gap-1">
              <label>
                {labels[k]}{" "}
                <select
                  className="rounded border p-1"
                  value={scopes[k].mode}
                  onChange={(e) =>
                    setScopes({ ...scopes, [k]: { ...scopes[k], mode: e.target.value as Scope["mode"] } })
                  }
                >
                  <option value="hidden">Oculto</option>
                  <option value="all">Todas las categorías</option>
                  <option value="selected">Elegir categorías</option>
                </select>
              </label>
              {scopes[k].mode === "selected" && (
                <CategoryChoices
                  options={options(k)}
                  selected={scopes[k].categories}
                  change={(categories) => setScopes({ ...scopes, [k]: { mode: "selected", categories } })}
                />
              )}
            </div>
          ))}
        </>
      )}
      {tab === "customer" ? <>
        <label>Dirección para todos los clientes<Input readOnly value={PUBLIC_CATALOG_URL} onFocus={e => e.target.select()} /></label>
        <Button onClick={async () => {
          try { await navigator.clipboard.writeText(PUBLIC_CATALOG_URL); setMessage("Dirección copiada.") }
          catch { setMessage("Selecciona la dirección para copiarla.") }
        }}>Copiar dirección</Button>
      </> : <Button disabled={unavailable || busy} onClick={() => void submit()}>
        {customerId ? "Guardar acceso del cliente" : "Guardar portada"}
      </Button>}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </fieldset>
  )
}
