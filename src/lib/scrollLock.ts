import { useEffect } from 'react'

const OVERLAY_SELECTOR = '[role="dialog"], .fixed.inset-0'

/** true si hay un modal, hoja o panel a pantalla completa visible (los ocultos con CSS no cuentan). */
function overlayVisible(): boolean {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some((element) => element.getClientRects().length > 0)
}

/**
 * Bloquea el desplazamiento de la página mientras haya algún modal o panel abierto,
 * para que en el celular el gesto mueva el modal y no la lista de fondo.
 * Observa el DOM en vez de una lista de estados: así cubre también los modales
 * internos de cada módulo (expediente, confirmaciones, hojas de acciones...).
 */
export function useOverlayScrollLock() {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    const update = () => {
      frame = 0
      root.classList.toggle('scroll-locked', overlayVisible())
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
      root.classList.remove('scroll-locked')
    }
  }, [])
}
