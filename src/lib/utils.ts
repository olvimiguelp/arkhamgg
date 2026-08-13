import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
/**
 * Formatea un número como moneda con decimales
 * Ejemplo: 3000.10 → "3,000.10"
 */
export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.00'
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formatea un número como moneda con símbolo RD$
 * Ejemplo: 3000.10 → "RD$3,000.10"
 */
export function formatCurrencyRD(value: number | string): string {
  return `RD$${formatCurrency(value)}`
}

/**
 * Formatea un número como moneda con símbolo $
 * Ejemplo: 3000.10 → "$3,000.10"
 */
export function formatCurrencyUSD(value: number | string): string {
  return `$${formatCurrency(value)}`
}