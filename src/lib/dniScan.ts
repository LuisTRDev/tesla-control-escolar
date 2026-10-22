import { useEffect, useRef } from 'react'

/**
 * Extrae el DNI de lo que entrega un lector: puede ser solo el número, o el
 * contenido completo de un código 2D (PDF417/QR) con otros datos mezclados.
 * Devuelve los candidatos de 8 dígitos en orden de aparición, sin repetir.
 */
export function extractDniCandidates(raw: string): string[] {
  const found = new Set<string>()
  for (const match of raw.matchAll(/(?<!\d)\d{8}(?!\d)/g)) found.add(match[0])
  if (found.size === 0) {
    // Algunos lectores pegan el DNI con guion de control (12345678-9) o espacios internos.
    const compact = raw.replace(/\D/g, '')
    if (compact.length === 8) found.add(compact)
  }
  return [...found]
}

/** Elige el candidato que coincide con un alumno; si ninguno coincide, el primero. */
export function pickDni(raw: string, isKnown: (dni: string) => boolean): string | null {
  const candidates = extractDniCandidates(raw)
  if (candidates.length === 0) return null
  return candidates.find(isKnown) ?? candidates[0]
}

const MAX_GAP_MS = 60
const MIN_LENGTH = 6

/**
 * Detecta lectores USB/Bluetooth que "escriben" como teclado: ráfaga de teclas
 * con menos de 60 ms entre sí y terminada en Enter. Funciona aunque el campo de
 * texto no tenga el foco. Una persona tecleando a mano es más lenta y no dispara.
 */
export function useKeyboardScanner(active: boolean, onScan: (raw: string) => void) {
  const callback = useRef(onScan)
  useEffect(() => { callback.current = onScan }, [onScan])

  useEffect(() => {
    if (!active) return
    let buffer = ''
    let last = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const now = performance.now()
      if (now - last > MAX_GAP_MS) buffer = ''
      last = now
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer.length >= MIN_LENGTH) {
          // Sin esto, el Enter llegaría también al campo de DNI y lo buscaría con sus primeros 8 dígitos.
          event.preventDefault()
          event.stopPropagation()
          callback.current(buffer)
        }
        buffer = ''
        return
      }
      if (event.key.length === 1) buffer += event.key
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
}
