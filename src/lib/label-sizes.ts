export const LABEL_SIZES = {
  "25x15": { width: 25, height: 15 },
  "30x15": { width: 30, height: 15 },
  "30x20": { width: 30, height: 20 },
  "30x30": { width: 30, height: 30 },
  "30x40": { width: 30, height: 40 },
  "40x20": { width: 40, height: 20 },
  "40x30": { width: 40, height: 30 },
  "40x40": { width: 40, height: 40 },
  "40x50": { width: 40, height: 50 },
  "40x60": { width: 40, height: 60 },
  "40x70": { width: 40, height: 70 },
  "50x30": { width: 50, height: 30 },
  "50x40": { width: 50, height: 40 },
  "50x50": { width: 50, height: 50 },
  "50x70": { width: 50, height: 70 },
  "50x80": { width: 50, height: 80 },
} as const

export type LabelSizeKey = keyof typeof LABEL_SIZES
export type LabelSize = (typeof LABEL_SIZES)[LabelSizeKey]

/** Converts millimetres to CSS pixels at the standard 96 DPI CSS reference. */
export const mmToPx = (mm: number) => (mm * 96) / 25.4

export const DEFAULT_LABEL_SIZE: LabelSizeKey = "40x30"

const LABEL_SIZE_STORAGE_PREFIX = "arkham-label-size"

/** Reads the last label size selected by this user. Browser storage is optional for Electron/SSR. */
export function getStoredLabelSize(userId?: string | null): LabelSizeKey {
  if (typeof window === "undefined") return DEFAULT_LABEL_SIZE
  try {
    const value = window.localStorage.getItem(`${LABEL_SIZE_STORAGE_PREFIX}:${userId || "default"}`)
    return value && value in LABEL_SIZES ? value as LabelSizeKey : DEFAULT_LABEL_SIZE
  } catch {
    return DEFAULT_LABEL_SIZE
  }
}

export function storeLabelSize(userId: string | null | undefined, value: LabelSizeKey) {
  try {
    window.localStorage.setItem(`${LABEL_SIZE_STORAGE_PREFIX}:${userId || "default"}`, value)
  } catch {
    // Storage can be disabled; printing still works with the current selection.
  }
}
