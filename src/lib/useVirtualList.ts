import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

/**
 * Lista virtualizada para filas de alto variable: solo se montan las filas visibles
 * (más un margen), el resto se reemplaza por espacio. Con todo el colegio en el Modo rápido
 * (cientos de alumnos) evita miles de nodos en celulares modestos.
 *
 * Uso: la lista va en un contenedor con `containerRef`; se renderizan solo los índices
 * de `range`, cada uno dentro de un elemento con `ref={measure(key)}` (su alto, con margen
 * inferior incluido como padding, se mide solo), y el contenedor lleva `style={spacers}`.
 */
type Options = {
  count: number
  getKey: (index: number) => string
  /** Alto estimado de una fila aún no medida. */
  estimate: number
  /** Margen en px por encima y debajo de lo visible que se mantiene montado. */
  overscanPx?: number
  enabled: boolean
  containerRef: RefObject<HTMLElement | null>
}

function findScroller(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current)
    if (overflowY === 'auto' || overflowY === 'scroll') return current
  }
  return null
}

/** Qué filas montar según el desplazamiento: pura para poder probarla. */
export function computeWindow(count: number, sizeOf: (index: number) => number, top: number, height: number, overscanPx: number) {
  const offsets = new Array<number>(count + 1)
  offsets[0] = 0
  for (let index = 0; index < count; index++) offsets[index + 1] = offsets[index] + sizeOf(index)
  const from = top - overscanPx
  const to = top + height + overscanPx
  let start = 0
  while (start < count - 1 && offsets[start + 1] < from) start++
  let end = start
  while (end < count && offsets[end] < to) end++
  return {
    range: { start, end },
    spacers: { paddingTop: offsets[start], paddingBottom: offsets[count] - offsets[end] },
  }
}

export function useVirtualList({ count, getKey, estimate, overscanPx = 700, enabled, containerRef }: Options) {
  const sizes = useRef(new Map<string, number>())
  const observer = useRef<ResizeObserver | null>(null)
  const keyByElement = useRef(new WeakMap<Element, string>())
  const [version, setVersion] = useState(0)
  const [view, setView] = useState({ top: 0, height: 900 })

  // Recalcula qué parte de la lista se ve, respecto al contenedor.
  useEffect(() => {
    const container = containerRef.current
    if (!enabled || !container) return
    const scroller = findScroller(container)
    const target: HTMLElement | Window = scroller ?? window
    let frame = 0
    const measureView = () => {
      frame = 0
      const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0
      const top = scrollerTop - container.getBoundingClientRect().top
      const height = scroller ? scroller.clientHeight : window.innerHeight
      setView((previous) => (Math.abs(previous.top - top) < 1 && previous.height === height ? previous : { top, height }))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measureView) }
    target.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    measureView()
    return () => {
      target.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled, containerRef, count])

  useEffect(() => () => observer.current?.disconnect(), [])

  const measure = useCallback((key: string) => (element: HTMLElement | null) => {
    if (!element) return
    if (!observer.current) {
      observer.current = new ResizeObserver((entries) => {
        let changed = false
        for (const entry of entries) {
          const rowKey = keyByElement.current.get(entry.target)
          if (rowKey === undefined) continue
          const height = (entry.target as HTMLElement).offsetHeight
          if (height > 0 && sizes.current.get(rowKey) !== height) { sizes.current.set(rowKey, height); changed = true }
        }
        if (changed) setVersion((value) => value + 1)
      })
    }
    keyByElement.current.set(element, key)
    observer.current.observe(element)
  }, [])

  return useMemo(() => {
    if (!enabled) return { range: { start: 0, end: count }, spacers: undefined, measure }
    const { range, spacers } = computeWindow(count, (index) => sizes.current.get(getKey(index)) ?? estimate, view.top, view.height, overscanPx)
    return { range, spacers, measure }
    // `version` cambia cuando se mide una fila nueva: hay que recalcular los desplazamientos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, count, view, version, estimate, overscanPx, measure, getKey])
}
