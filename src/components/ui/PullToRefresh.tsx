import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { haptic } from '@/lib/haptics'

const TRIGGER = 64
const MAX_PULL = 96
const RESISTANCE = 0.5

type Props = {
  onRefresh: () => Promise<unknown> | void
  disabled?: boolean
}

/** Primer ancestro con scroll propio; si no hay, la página entera (window). */
function findScroller(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current)
    if (overflowY === 'auto' || overflowY === 'scroll') return current
    if (current.hasAttribute('data-screen-overlay')) return current
  }
  return null
}

/**
 * "Tirar para actualizar" propio de la app (el del navegador no existe en la app instalada).
 * Se coloca como primer elemento del contenido de una lista o módulo: al tirar hacia abajo estando arriba del todo
 * aparece el indicador y, pasado el umbral, llama a onRefresh. No actúa dentro de diálogos
 * ni cuando el gesto empieza en una lista interna que ya se desplazó.
 */
export default function PullToRefresh({ onRefresh, disabled = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  const run = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try { await onRefreshRef.current() } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (disabled || !root) return
    // Se busca al empezar cada gesto: el contenedor con scroll puede aparecer después de montar.
    let scroller: HTMLElement | null = null
    const atTop = () => (scroller ? scroller.scrollTop <= 0 : window.scrollY <= 0)

    let startY: number | null = null
    let engaged = false
    let crossed = false
    let current = 0

    const reset = () => { startY = null; engaged = false; crossed = false; current = 0; setPull(0) }

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || refreshingRef.current) return
      const target = event.target
      if (!(target instanceof Element)) return
      scroller = findScroller(root)
      // Solo gestos dentro de la zona de esta lista (su contenedor con scroll, o la página).
      if (scroller && !scroller.contains(target)) return
      // Un diálogo u hoja encima no es de esta lista.
      const overlay = target.closest('.fixed.inset-0, [role="dialog"]')
      if (overlay && overlay !== scroller) return
      for (let node: Element | null = target; node && node !== scroller; node = node.parentElement) {
        if (node instanceof HTMLElement && node.scrollTop > 0) return
      }
      if (!atTop()) return
      startY = event.touches[0].clientY
    }

    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const dy = event.touches[0].clientY - startY
      if (!engaged) {
        if (dy < 0) { startY = null; return }
        if (dy < 8 || !atTop()) return
        engaged = true
      }
      if (event.cancelable) event.preventDefault()
      current = Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL)
      if (current >= TRIGGER && !crossed) { crossed = true; haptic('threshold') }
      else if (current < TRIGGER) crossed = false
      setPull(current)
    }

    const onEnd = () => {
      const shouldRefresh = engaged && current >= TRIGGER
      reset()
      if (shouldRefresh) void run()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }, [disabled, run])

  const shown = refreshing ? 44 : pull
  return (
    <div ref={rootRef}>
      <div
        aria-hidden={shown === 0}
        style={{ height: shown, transition: pull === 0 ? 'height 180ms ease-out' : undefined }}
        className="grid place-items-end justify-center overflow-hidden text-slate-500 dark:text-slate-400"
      >
        {shown > 0 && (
          <div className="mb-2 grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
              style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / TRIGGER) }}
            />
          </div>
        )}
      </div>
      <span className="sr-only" role="status">{refreshing ? 'Actualizando…' : ''}</span>
    </div>
  )
}
