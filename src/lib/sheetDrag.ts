import { useEffect } from 'react'
import { haptic } from '@/lib/haptics'

/**
 * Arrastrar hacia abajo para cerrar cualquier diálogo marcado con data-sheet (celular).
 * Como en una app nativa: la hoja sigue al dedo y, si se suelta lejos o con impulso, se cierra;
 * si no, vuelve a su sitio. Solo arranca si la hoja está arriba del todo (scroll en 0), para no
 * pelear con el desplazamiento del contenido.
 *
 * Es genérico (observa el DOM, como scrollLock) para no tocar cada diálogo: el cierre se pide
 * con el mismo medio que ya usa cada uno (botón "Cerrar" o toque en el fondo).
 */
const MOBILE_QUERY = '(max-width: 639px)'
const CLOSE_DISTANCE = 110
const CLOSE_VELOCITY = 0.7 // px por ms
const SNAP_MS = 220

type Drag = {
  sheet: HTMLElement
  overlay: HTMLElement | null
  startX: number
  startY: number
  lastY: number
  lastT: number
  velocity: number
  engaged: boolean
}

/** true si algún contenedor con scroll entre el punto tocado y la hoja ya se desplazó. */
function scrolledInside(target: Element, sheet: HTMLElement): boolean {
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) return true
    if (node === sheet) break
  }
  return false
}

function requestClose(sheet: HTMLElement, overlay: HTMLElement | null) {
  const closeButton = sheet.querySelector<HTMLElement>('[data-sheet-close], button[aria-label="Cerrar"]')
  if (closeButton) { closeButton.click(); return }
  // Los diálogos cierran al tocar el fondo: se simula ese mismo toque sobre el overlay.
  for (const type of ['mousedown', 'mouseup', 'click']) {
    overlay?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
  }
}

export function useSheetDragToClose() {
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    let drag: Drag | null = null

    const onStart = (event: TouchEvent) => {
      if (!media.matches || event.touches.length !== 1) return
      const target = event.target
      if (!(target instanceof Element)) return
      const sheet = target.closest<HTMLElement>('[data-sheet]')
      if (!sheet || sheet.dataset.sheetDrag === 'off') return
      if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]')) return
      if (scrolledInside(target, sheet)) return
      const touch = event.touches[0]
      drag = {
        sheet, overlay: sheet.closest<HTMLElement>('[data-sheet-overlay]'),
        startX: touch.clientX, startY: touch.clientY, lastY: touch.clientY, lastT: event.timeStamp, velocity: 0, engaged: false,
      }
    }

    const onMove = (event: TouchEvent) => {
      if (!drag) return
      const touch = event.touches[0]
      const dy = touch.clientY - drag.startY
      const dx = touch.clientX - drag.startX
      if (!drag.engaged) {
        // Hacia arriba o de lado: es scroll o un gesto del contenido, no un cierre.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { drag = null; return }
        if (dy < 10) return
        drag.engaged = true
        drag.sheet.style.transition = 'none'
        drag.sheet.style.willChange = 'transform'
      }
      const dt = event.timeStamp - drag.lastT
      if (dt > 0) drag.velocity = (touch.clientY - drag.lastY) / dt
      drag.lastY = touch.clientY
      drag.lastT = event.timeStamp
      // Detiene el scroll/rebote de fondo mientras la hoja sigue al dedo.
      if (event.cancelable) event.preventDefault()
      drag.sheet.style.transform = `translateY(${Math.max(0, dy)}px)`
    }

    const finish = (cancelled: boolean) => {
      const current = drag
      drag = null
      if (!current?.engaged) return
      const { sheet, overlay } = current
      const dy = current.lastY - current.startY
      const shouldClose = !cancelled && (dy > CLOSE_DISTANCE || current.velocity > CLOSE_VELOCITY)
      sheet.style.transition = `transform ${SNAP_MS}ms ease-out`
      if (shouldClose) {
        haptic('threshold')
        sheet.style.transform = 'translateY(100%)'
        window.setTimeout(() => requestClose(sheet, overlay), SNAP_MS * 0.6)
      } else {
        sheet.style.transform = ''
      }
      // Si el diálogo no se cerró (p. ej. está guardando), vuelve a su sitio.
      window.setTimeout(() => {
        if (!sheet.isConnected) return
        sheet.style.transition = `transform ${SNAP_MS}ms ease-out`
        sheet.style.transform = ''
        window.setTimeout(() => { sheet.style.transition = ''; sheet.style.willChange = '' }, SNAP_MS)
      }, shouldClose ? SNAP_MS + 400 : SNAP_MS)
    }

    const onEnd = () => finish(false)
    const onCancel = () => finish(true)

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [])
}
