import { useEffect, useState } from 'react'

const MIN_DELTA = 10 // px: ignora el temblor del dedo
const TOP_ZONE = 80 // cerca del inicio de la página siempre se muestra

/**
 * true cuando se debe ocultar una barra fija: al bajar por la lista se esconde para ganar
 * pantalla y reaparece al subir un poco, al llegar al inicio o al final de la página.
 */
export function useHideOnScroll(enabled = true) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!enabled) { setHidden(false); return }
    let lastY = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const maxY = document.documentElement.scrollHeight - window.innerHeight
      const delta = y - lastY
      if (y <= TOP_ZONE || y >= maxY - 4) setHidden(false)
      else if (delta > MIN_DELTA) setHidden(true)
      else if (delta < -MIN_DELTA) setHidden(false)
      if (Math.abs(delta) > MIN_DELTA || y <= TOP_ZONE) lastY = y
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled])

  return hidden
}
