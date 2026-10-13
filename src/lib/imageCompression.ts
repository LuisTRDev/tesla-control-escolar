/**
 * Compresión de fotos en el navegador antes de subirlas (evidencias de
 * justificaciones y permisos). Reduce el tamaño, recodifica a WebP (o JPEG si
 * el navegador no codifica WebP) y, al redibujar en canvas, elimina los
 * metadatos EXIF, incluida la ubicación GPS de la foto.
 */

/** Lado mayor en píxeles: suficiente para leer una constancia o certificado. */
const MAX_SIDE = 1280
/** Segundo intento si a MAX_SIDE no baja del objetivo. */
const FALLBACK_SIDE = 1024
/** Peso objetivo: se baja la calidad hasta quedar por debajo. */
const TARGET_BYTES = 150 * 1024
const QUALITIES = [0.6, 0.5, 0.42, 0.35]

export type CompressedImage = { blob: Blob; ext: 'webp' | 'jpg'; mime: string; originalBytes: number }

/** Escala (ancho, alto) para que el lado mayor no pase de `max`, sin agrandar. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

async function encodeAt(bitmap: ImageBitmap, maxSide: number): Promise<Blob | null> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Fondo blanco: un PNG con transparencia no debe quedar negro.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)

  let best: Blob | null = null
  for (const quality of QUALITIES) {
    let blob = await toBlob(canvas, 'image/webp', quality)
    // Safari antiguo no codifica WebP y devuelve PNG: se usa JPEG.
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)
    if (!blob) continue
    if (!best || blob.size < best.size) best = blob
    if (blob.size <= TARGET_BYTES) break
  }
  canvas.width = 0
  canvas.height = 0
  return best
}

/**
 * Comprime una foto al máximo manteniéndola legible. Si el resultado no es más
 * liviano que el original, devuelve null y se sube el original.
 */
export async function compressImage(file: Blob): Promise<CompressedImage | null> {
  let bitmap: ImageBitmap
  try {
    // 'from-image' respeta la orientación del celular (EXIF) para que no salga girada.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  try {
    let blob = await encodeAt(bitmap, MAX_SIDE)
    if (blob && blob.size > TARGET_BYTES && Math.max(bitmap.width, bitmap.height) > FALLBACK_SIDE) {
      const smaller = await encodeAt(bitmap, FALLBACK_SIDE)
      if (smaller && smaller.size < blob.size) blob = smaller
    }
    if (!blob || blob.size >= file.size) return null
    const webp = blob.type === 'image/webp'
    return { blob, ext: webp ? 'webp' : 'jpg', mime: webp ? 'image/webp' : 'image/jpeg', originalBytes: file.size }
  } finally {
    bitmap.close()
  }
}
