import { describe, expect, it } from 'vitest'
import { fitWithin } from '@/lib/imageCompression'

describe('fitWithin', () => {
  it('reduce el lado mayor al máximo manteniendo la proporción', () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 })
  })

  it('no agranda fotos pequeñas', () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })
})
