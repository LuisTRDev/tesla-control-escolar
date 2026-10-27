/**
 * Archivos recibidos desde el menú "Compartir" del teléfono (manifest share_target).
 * El service worker los guarda en una caché y abre la app con ?shared=N; aquí se leen y se borran.
 */
const SHARE_CACHE = 'tesla-shared-v1'

/** Cantidad de archivos pendientes si la URL trae ?shared=, o null si no se abrió desde Compartir. */
export function readSharedParam(): number | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const value = params.get('shared')
    if (value === null) return null
    params.delete('shared')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
    const count = Number.parseInt(value, 10)
    return Number.isFinite(count) && count > 0 ? count : 0
  } catch {
    return null
  }
}

export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return []
  const cache = await caches.open(SHARE_CACHE)
  const files: File[] = []
  for (const request of await cache.keys()) {
    const response = await cache.match(request)
    if (!response) continue
    const blob = await response.blob()
    let name = 'documento'
    try { name = decodeURIComponent(response.headers.get('X-File-Name') ?? name) } catch { /* nombre ilegible: se usa el genérico */ }
    files.push(new File([blob], name, { type: blob.type }))
    await cache.delete(request)
  }
  return files
}
