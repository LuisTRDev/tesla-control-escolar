import { safeFileName } from '@/lib/security'

export const MAX_HISTORICAL_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'heic'])

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export async function validateHistoricalFile(file: File): Promise<{ extension: string; safeName: string }> {
  if (!(file instanceof File)) throw new Error('Archivo inválido.')
  if (file.size <= 0) throw new Error('El archivo está vacío.')
  if (file.size > MAX_HISTORICAL_FILE_BYTES) throw new Error('El archivo supera el límite de 10 MB.')

  const extension = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Formato de archivo no permitido.')

  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const isZip = startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]) || startsWith(head, [0x50, 0x4b, 0x07, 0x08])
  const isCompound = startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  const isPdf = ascii(head, 0, 5) === '%PDF-'
  const isPng = startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const isJpeg = startsWith(head, [0xff, 0xd8, 0xff])
  const isWebp = ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP'
  const isHeic = ascii(head, 4, 4) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(head, 8, 12))

  let valid = false
  if (extension === 'xlsx' || extension === 'docx') valid = isZip
  else if (extension === 'xls' || extension === 'doc') valid = isCompound
  else if (extension === 'pdf') valid = isPdf
  else if (extension === 'png') valid = isPng
  else if (extension === 'jpg' || extension === 'jpeg') valid = isJpeg
  else if (extension === 'webp') valid = isWebp
  else if (extension === 'heic') valid = isHeic
  else if (extension === 'csv') {
    const sample = new TextDecoder('utf-8', { fatal: false }).decode(await file.slice(0, 4096).arrayBuffer())
    const lower = sample.trimStart().toLowerCase()
    valid = !sample.includes('\u0000') && !lower.startsWith('<!doctype html') && !lower.startsWith('<html') && !lower.includes('<script')
  }

  if (!valid) throw new Error('El contenido del archivo no coincide con su extensión o no es seguro para importar.')
  return { extension, safeName: safeFileName(file.name) }
}
