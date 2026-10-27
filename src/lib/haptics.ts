import { useEffect } from 'react'

/**
 * Respuesta táctil única para toda la app (Vibration API, solo Android/Chrome).
 * Un solo lugar define cuánto vibra cada gesto, para que se sienta igual en todas las pantallas.
 * Respeta la opción "Vibración" de Configuración y se ignora en silencio si el equipo no vibra.
 */
export type HapticKind =
  | 'tick' // toque en un botón o pestaña
  | 'select' // cambio de selección
  | 'threshold' // un gesto llegó al punto en que se activa (deslizar, tirar para actualizar)
  | 'success'
  | 'warning'
  | 'error'
  | 'alert' // aviso que debe notarse (tardanza nueva en el panel)

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 8,
  select: 12,
  threshold: 18,
  success: 35,
  warning: [40, 60, 40],
  error: [160, 90, 160],
  alert: 150,
}

let enabled = true

/** Lo llama la pantalla principal con la preferencia del usuario. */
export function setHapticsEnabled(value: boolean) {
  enabled = value
}

export function haptic(kind: HapticKind, options: { force?: boolean } = {}) {
  if (!enabled && !options.force) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(PATTERNS[kind])
  } catch {
    // Sin vibración: no pasa nada.
  }
}

/**
 * Un "tic" suave al tocar cualquier botón con el dedo, sin tener que cablear cada uno.
 * Un botón puede excluirse con data-haptic="off" (ya vibra por su cuenta) y los
 * deshabilitados no vibran. El ratón no vibra: solo toques de pantalla.
 */
export function useGlobalTapHaptics(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest('button, [role="button"], [role="tab"], a[href]')
      if (!control || control.closest('[data-haptic="off"]')) return
      if (control instanceof HTMLButtonElement && control.disabled) return
      if (control.getAttribute('aria-disabled') === 'true') return
      haptic('tick')
    }
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [active])
}
