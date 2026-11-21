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
  const availableSelected = selected.filter((name) => names.has(name))
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

export function CatalogPublication({ isAdmin, ownerId, credentials, warehouse, products }: Props) {
  const storefrontOwner = import.meta.env.VITE_STOREFRONT_OWNER_ID || "5992b49e-1b7c-4f2f-b3d1-894ce02c368a"
  const [tab, setTab] = useState<"customer" | "home" | "edit">("customer")
  const [kind, setKind] = useState<Kind>("normal")
  const [all, setAll] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [scopes, setScopes] = useState(initialScopes)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [url, setUrl] = useState("")
  const [assigned, setAssigned] = useState<string[] | null>(null)
  const options = (k: Kind) => (k === "warehouse" ? warehouse : products)
  useEffect(() => {
    if (tab !== "home") return
    let current = true
    setLoaded(false)
    void (async () => {
      try {
        const { data, error } = await createClient().rpc("catalog_storefront_sections", { p_owner: ownerId })
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
  }, [tab, ownerId])

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
                : scopes[k].categories.filter((category) => options(k).some((option) => option.value === category)),
          ]),
        )
        const { error } = await db.rpc("save_catalog_storefront", { ...actor, p_sections: rules })
        if (error) throw new Error(error.message)
        setMessage("Portada guardada.")
      } else if (tab === "customer") {
        const { error } = await db.rpc("configure_catalog_publication", {
          ...actor,
          p_kind: kind,
          p_categories: all ? [] : selected,
          p_home: true,
        })
        if (error) throw new Error(error.message)
        setUrl(PUBLIC_CATALOG_URL)
      } else {
        const token = new URL(url.trim()).searchParams.get("token")
        if (!token) throw new Error("Pega el enlace completo del cliente.")
        const { data, error } = await db.rpc("manage_customer_catalog", {
          ...actor,
          p_token: token,
          p_add: assigned ? selected : [],
        })
        if (error) throw new Error(error.message)
        setKind(data.kind)
        setAssigned(data.categories)
        setSelected([])
        if (assigned) setMessage("El cliente verá las categorías al recargar el mismo enlace.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el catálogo.")
    } finally {
      setBusy(false)
    }
  }

  const unavailable =
    tab === "home"
      ? !loaded || kinds.some((k) => scopes[k].mode === "selected" && !scopes[k].categories.length)
      : tab === "customer"
        ? !all && !selected.length
        : !url.trim() || (assigned !== null && !selected.length)
  return (
    <fieldset disabled={busy} className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(["customer", "home", "edit"] as const)
          .filter((v) => v === "customer" || (isAdmin && (v !== "home" || ownerId === storefrontOwner)))
          .map((v) => (
            <Button
              key={v}
              variant={tab === v ? "default" : "outline"}
              onClick={() => {
                setTab(v)
                setUrl("")
                setAssigned(null)
                setSelected([])
                setMessage("")
                setAll(true)
              }}
            >
              {v === "home" ? "Portada pública" : v === "customer" ? "Nuevo enlace" : "Editar enlace"}
            </Button>
          ))}
      </div>
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
      {tab === "customer" && (
        <>
          <label>
            Tipo de catálogo{" "}
            <select
              className="rounded border p-1"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind)
                setSelected([])
                setUrl("")
              }}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => {
                setAll(e.target.checked)
                setUrl("")
              }}
            />{" "}
            Todas las categorías
          </label>
          {!all && (
            <CategoryChoices
              options={options(kind)}
              selected={selected}
              change={(v) => {
                setSelected(v)
                setUrl("")
              }}
            />
          )}
          {url && (
            <label>
              Enlace para el cliente
              <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            </label>
          )}
        </>
      )}
      {tab === "edit" && (
        <>
          <label>
            Enlace enviado al cliente
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setAssigned(null)
                setSelected([])
                setMessage("")
              }}
            />
          </label>
          {assigned && (
            <>
              <p>
                {labels[kind]} · {assigned.length ? assigned.join(", ") : "Todas las categorías"}
              </p>
              {!!assigned.length && (
                <CategoryChoices
                  options={options(kind).filter((o) => !assigned.includes(o.value))}
                  selected={selected}
                  change={setSelected}
                />
              )}
            </>
          )}
        </>
      )}
      {tab === "customer" && url ? (
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setMessage("Enlace copiado.")
            } catch {
              setMessage("Selecciona el enlace y cópialo.")
            }
          }}
        >
          Copiar enlace
        </Button>
      ) : (
        <Button disabled={unavailable || busy} onClick={() => void submit()}>
          {tab === "home"
            ? "Guardar portada"
            : tab === "customer"
              ? "Crear enlace"
              : assigned
                ? "Activar en este enlace"
                : "Ver categorías"}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </fieldset>
  )
}
