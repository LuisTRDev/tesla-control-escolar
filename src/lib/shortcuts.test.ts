import { describe, expect, it } from 'vitest'
import { pickEnterTarget } from '@/lib/shortcuts'
import { fetchAllPages } from '@/lib/paging'

describe('pickEnterTarget', () => {
  it('marca solo si queda exactamente un alumno sin marcar', () => {
    expect(pickEnterTarget(['ana'])).toEqual({ kind: 'mark', item: 'ana' })
  })

  it('con varios coincidentes pide seguir escribiendo', () => {
    expect(pickEnterTarget(['ana', 'andrés'])).toEqual({ kind: 'many', count: 2 })
  })

  it('sin coincidencias no hace nada', () => {
    expect(pickEnterTarget([])).toEqual({ kind: 'none' })
  })
})

describe('fetchAllPages', () => {
  const source = Array.from({ length: 2500 }, (_, i) => i)
  const page = async (from: number, to: number) => ({ data: source.slice(from, to + 1), error: null })

  it('junta todas las páginas', async () => {
    expect(await fetchAllPages(page)).toHaveLength(2500)
  })

  it('con exactamente una página completa pide una más para confirmar el final', async () => {
    let calls = 0
    const rows = await fetchAllPages(async (from, to) => { calls++; return { data: source.slice(0, 1000).slice(from, to + 1), error: null } })
    expect(rows).toHaveLength(1000)
    expect(calls).toBe(2)
  })

  it('propaga el error de cualquier página', async () => {
    await expect(fetchAllPages(async (from) => (from === 0 ? { data: source.slice(0, 1000), error: null } : { data: null, error: new Error('fallo') }))).rejects.toThrow('fallo')
  })
})
