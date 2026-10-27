import { describe, expect, it } from 'vitest'
import { computeWindow } from '@/lib/useVirtualList'

describe('computeWindow', () => {
  const size = () => 100

  it('monta solo las filas visibles más el margen y rellena el resto con espacio', () => {
    const { range, spacers } = computeWindow(1000, size, 0, 500, 200)
    expect(range).toEqual({ start: 0, end: 7 })
    expect(spacers).toEqual({ paddingTop: 0, paddingBottom: 100_000 - 700 })
  })

  it('al desplazarse deja espacio arriba para las filas ya pasadas', () => {
    const { range, spacers } = computeWindow(1000, size, 10_000, 500, 200)
    expect(range.start).toBe(97)
    expect(spacers.paddingTop).toBe(9_700)
    expect(spacers.paddingTop + (range.end - range.start) * 100 + spacers.paddingBottom).toBe(100_000)
  })

  it('con la lista vacía no monta nada', () => {
    expect(computeWindow(0, size, 0, 500, 200).range).toEqual({ start: 0, end: 0 })
  })

  it('usa el alto real de cada fila cuando es distinto', () => {
    const sizeOf = (index: number) => (index === 0 ? 400 : 100)
    const { range } = computeWindow(50, sizeOf, 0, 300, 0)
    expect(range).toEqual({ start: 0, end: 1 })
  })
})
