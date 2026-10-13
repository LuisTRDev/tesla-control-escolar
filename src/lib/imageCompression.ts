/**
 * Compresión de fotos en el navegador antes de subirlas (evidencias de
 * justificaciones y permisos), con browser-image-compression: reduce el tamaño,
 * respeta la orientación del celular, recodifica a WebP y elimina los
 * metadatos EXIF (incluida la ubicación GPS).
 */

/** Lado mayor en píxeles: suficiente para leer una constancia o certificado. */
const MAX_SIDE = 1280
/** Peso objetivo; la librería baja la calidad por pasos hasta llegar. */
const TARGET_MB = 0.15

export type CompressedImage = { blob: Blob; ext: string; mime: string }

const EXT_BY_MIME: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

/**
 * Comprime una foto al máximo manteniéndola legible. Devuelve null si el
 * resultado no es más liviano que el original. Si falla, lanza el error
 * (quien llama decide subir el original y avisar).
 */
export async function compressImage(file: File): Promise<CompressedImage | null> {
  // Carga bajo demanda: solo se descarga al adjuntar una foto.
  const { default: imageCompression } = await import('browser-image-compression')
  const blob = await imageCompression(file, {
    maxSizeMB: TARGET_MB,
    maxWidthOrHeight: MAX_SIDE,
    fileType: 'image/webp',
    initialQuality: 0.6,
    maxIteration: 12,
    // Sin web worker: la librería lo cargaría desde un CDN externo.
    useWebWorker: false,
  })
  if (blob.size >= file.size) return null
  const mime = EXT_BY_MIME[blob.type] ? blob.type : 'image/jpeg'
  return { blob, ext: EXT_BY_MIME[mime], mime }
}
