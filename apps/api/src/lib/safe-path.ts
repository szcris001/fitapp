import path from 'path'

// ── Protección path traversal ─────────────────────────────────────────────────
// Valida que el filepath resuelto no salga del directorio base permitido.
export function safeResolvePath(base: string, filename: string): string | null {
  // Rechazar filename que contenga separadores de directorio o nulos
  if (/[/\\]|\.\.|\0/.test(filename)) return null
  const resolved = path.resolve(base, filename)
  // La ruta resuelta debe empezar con la base
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null
  return resolved
}
