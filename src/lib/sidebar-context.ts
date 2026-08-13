import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react"

type SidebarContextValue = {
  collapsed: boolean
  toggleCollapsed: () => void
  setCollapsed: (value: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  const value = useMemo(
    () => ({
      collapsed,
      toggleCollapsed: () => setCollapsed((prev) => !prev),
      setCollapsed,
    }),
    [collapsed],
  )

  return createElement(SidebarContext.Provider, { value }, children)
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}
