"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { RotateCcw } from "lucide-react"

interface PatternLockProps {
  value?: string // e.g. "1-2-3-6" or "1"
  onChange: (value: string) => void
  disabled?: boolean
}

// Center coordinates for 3x3 grid inside a 240x240 box
const NODE_COORDS: Record<number, { x: number; y: number }> = {
  1: { x: 40, y: 40 },
  2: { x: 120, y: 40 },
  3: { x: 200, y: 40 },
  4: { x: 40, y: 120 },
  5: { x: 120, y: 120 },
  6: { x: 200, y: 120 },
  7: { x: 40, y: 200 },
  8: { x: 120, y: 200 },
  9: { x: 200, y: 200 },
}

export function PatternLock({ value = "", onChange, disabled = false }: PatternLockProps) {
  // Parse pattern sequence - handles "1", "1-2-3-6", etc.
  const selectedNodes: number[] = value
    ? value
        .split("-")
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 1 && n <= 9)
    : []

  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const addNode = (node: number) => {
    if (disabled) return
    if (selectedNodes.includes(node)) return
    const nextSequence = [...selectedNodes, node]
    onChange(nextSequence.join("-"))
  }

  const handlePointerDown = (node: number) => {
    if (disabled) return
    setIsDragging(true)
    addNode(node)
  }

  const handlePointerEnter = (node: number) => {
    if (disabled || !isDragging) return
    addNode(node)
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  const handleClear = () => {
    onChange("")
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-1 w-full select-none">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">
        Dibuje el patrón de desbloqueo tocando o arrastrando sobre los puntos:
      </p>

      {/* Dark Pattern Square Box matching reference UI */}
      <div
        ref={containerRef}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative flex items-center justify-center w-[240px] h-[240px] rounded-2xl bg-[#0b1329] border border-slate-800 shadow-xl p-4 overflow-hidden touch-none"
      >
        {/* SVG lines connecting selected nodes */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 240 240">
          {selectedNodes.map((node, i) => {
            if (i === 0) return null
            const prevNode = selectedNodes[i - 1]
            const p1 = NODE_COORDS[prevNode]
            const p2 = NODE_COORDS[node]
            if (!p1 || !p2) return null
            return (
              <line
                key={`${prevNode}-${node}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#3b82f6"
                strokeWidth="6"
                strokeLinecap="round"
                className="opacity-90"
              />
            )
          })}
        </svg>

        {/* 3x3 Grid of nodes */}
        <div className="grid grid-cols-3 gap-8 z-10">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((node) => {
            const orderIndex = selectedNodes.indexOf(node)
            const isSelected = orderIndex !== -1

            return (
              <button
                key={node}
                type="button"
                disabled={disabled}
                onPointerDown={() => handlePointerDown(node)}
                onPointerEnter={() => handlePointerEnter(node)}
                onClick={() => addNode(node)}
                className={`relative flex h-12 w-12 items-center justify-center rounded-full font-bold transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/50 ring-4 ring-blue-400/40 scale-105"
                    : "bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/60"
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 rounded-full transition-all ${
                    isSelected ? "bg-white" : "bg-slate-400/80"
                  }`}
                />
                {isSelected && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-white shadow">
                    {orderIndex + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer Info & Clear Button */}
      <div className="flex items-center justify-between w-[240px] text-xs px-1">
        <div className="text-gray-600 dark:text-gray-300 font-medium truncate text-xs">
          {selectedNodes.length > 0 ? (
            <span>
              Patrón: <strong className="font-mono text-blue-600 dark:text-blue-400">{selectedNodes.join(" → ")}</strong>
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400 text-xs">Sin patrón dibujado</span>
          )}
        </div>

        {selectedNodes.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            onClick={handleClear}
            disabled={disabled}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}
