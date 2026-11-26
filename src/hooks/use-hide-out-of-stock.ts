import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "arkham-hide-out-of-stock-in-sales-catalog"
const CHANGE_EVENT = "arkham:hide-out-of-stock-change"

export function useHideOutOfStock() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const readPreference = () => setEnabled(window.localStorage.getItem(STORAGE_KEY) === "true")
    readPreference()
    window.addEventListener("storage", readPreference)
    window.addEventListener(CHANGE_EVENT, readPreference)
    return () => {
      window.removeEventListener("storage", readPreference)
      window.removeEventListener(CHANGE_EVENT, readPreference)
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !enabled
    window.localStorage.setItem(STORAGE_KEY, String(next))
    setEnabled(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [enabled])

  return { hideOutOfStock: enabled, toggleHideOutOfStock: toggle }
}
