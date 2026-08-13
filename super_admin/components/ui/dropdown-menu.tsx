"use client"

import React, { createContext, useContext, useRef, useEffect } from "react"
import { cn } from "../../lib/utils"

interface DropdownMenuContextType {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
}

const DropdownMenuContext = createContext<DropdownMenuContextType | undefined>(undefined)

export function DropdownMenu({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const triggerRef = useRef<HTMLElement | null>(null)

  const setOpen = (val: boolean) => {
    onOpenChange?.(val)
  }

  return (
    <DropdownMenuContext.Provider value={{ open: !!open, setOpen, triggerRef }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactElement
  asChild?: boolean
}) {
  const context = useContext(DropdownMenuContext)
  if (!context) throw new Error("DropdownMenuTrigger must be used within a DropdownMenu")

  const { open, setOpen, triggerRef } = context

  const child = React.Children.only(children)

  return React.cloneElement(child, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node
      const { ref } = child as any
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      setOpen(!open)
      child.props.onClick?.(e)
    },
  })
}

export function DropdownMenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode
  align?: "start" | "end"
  className?: string
}) {
  const context = useContext(DropdownMenuContext)
  if (!context) throw new Error("DropdownMenuContent must be used within a DropdownMenu")

  const { open, setOpen, triggerRef } = context
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }, [open, setOpen, triggerRef])

  if (!open) return null

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-2 rounded-xl border border-border bg-card p-1 shadow-xl ring-1 ring-black/5 focus:outline-none transition-all duration-200 min-w-[12rem]",
        align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
        className
      )}
    >
      <div className="py-1">{children}</div>
    </div>
  )
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  disabled?: boolean
}) {
  const context = useContext(DropdownMenuContext)
  const setOpen = context?.setOpen

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return
    e.stopPropagation()
    onClick?.(e)
    setOpen?.(false)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted font-medium transition-colors cursor-pointer text-left",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {children}
    </button>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-border", className)} />
}
export type DropdownMenuProps = React.ComponentProps<typeof DropdownMenu>;
export type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuTrigger>;
export type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuContent>;
export type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuItem>;
export type DropdownMenuSeparatorProps = React.ComponentProps<typeof DropdownMenuSeparator>;
