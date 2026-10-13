import { describe, expect, it } from 'vitest'
import { formatTime12 } from '@/components/ui/TimePicker'

describe('formatTime12', () => {
  it('convierte de 24 h a 12 h con a. m./p. m.', () => {
    expect(formatTime12('07:50')).toBe('7:50 a. m.')
    expect(formatTime12('13:05')).toBe('1:05 p. m.')
    expect(formatTime12('00:15')).toBe('12:15 a. m.')
    expect(formatTime12('12:00')).toBe('12:00 p. m.')
  })

  it('sin hora devuelve vacío', () => {
    expect(formatTime12('')).toBe('')
  })
})
