/** Version de la app empaquetada (package.json) expuesta por Vite. */
export function getAppVersion(): string {
  const raw = import.meta.env.VITE_APP_VERSION
  return String(raw ?? "0.0.0").trim() || "0.0.0"
}

export function parseVersionParts(version: string): number[] {
  const cleaned = String(version ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+_-]/)[0]

  const parts = cleaned.split(".").map((part) => {
    const match = /^(\d+)/.exec(part)
    return match ? Number(match[1]) : 0
  })

  while (parts.length < 3) parts.push(0)
  return parts.slice(0, 4)
}

/** Negativo si a < b, 0 si igual, positivo si a > b */
export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a)
  const right = parseVersionParts(b)
  const len = Math.max(left.length, right.length)

  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Mostrar aviso de actualizacion solo si la app instalada es anterior a target_version. */
export function shouldShowUpdateForVersion(targetVersion?: string | null): boolean {
  const target = String(targetVersion ?? "").trim()
  if (!target) return true
  return compareVersions(getAppVersion(), target) < 0
}

export function isValidVersionInput(value: string): boolean {
  return /^\d+(\.\d+){0,3}$/.test(String(value ?? "").trim())
}

/** Texto por defecto al publicar actualizacion sin mensaje personalizado. */
export function buildDefaultUpdateContent(targetVersion: string, custom?: string): string {
  const note = String(custom ?? "").trim()
  if (note) return note
  const v = String(targetVersion).trim()
  return `Hay una nueva version ${v} disponible. Descarguela e instale desde el enlace.`
}
