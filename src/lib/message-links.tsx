import type { ReactNode } from "react"

const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const urlExactRegex = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i

export const normalizeExternalUrl = (value: string) =>
  value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`

export const openExternalLink = (value: string) => {
  if (typeof window === "undefined") return
  const url = normalizeExternalUrl(value)
  const electron = (window as Window & { require?: (module: string) => { shell?: { openExternal?: (u: string) => void } } }).require?.("electron")
  const shell = electron?.shell
  if (shell?.openExternal) {
    shell.openExternal(url)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

export function renderTextWithLinks(
  value: string,
  linkClassName = "text-sky-600 underline underline-offset-4 hover:text-sky-700",
): ReactNode {
  if (!value) return null
  const parts = value.split(urlRegex)
  return parts.map((part, index) => {
    if (!part) return null
    if (urlExactRegex.test(part)) {
      const normalized = normalizeExternalUrl(part)
      return (
        <a
          key={`link-${index}`}
          href={normalized}
          onClick={(event) => {
            event.preventDefault()
            openExternalLink(normalized)
          }}
          className={linkClassName}
        >
          {part}
        </a>
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}
