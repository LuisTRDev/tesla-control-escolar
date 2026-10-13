import { describe, expect, it } from 'vitest'
import { buildWhatsAppMessage, renderWhatsAppTemplate } from './communicationService'

const base = { phone: '987654321', guardianName: 'Ana Pérez', studentName: 'Luis Gómez', date: '2026-10-12' }

describe('buildWhatsAppMessage', () => {
  it('usa la plantilla por defecto con todos los datos', () => {
    const text = buildWhatsAppMessage({ ...base, type: 'LATE', time: '07:52', notificationNumber: 2 })
    expect(text).toContain('Estimado(a) Ana Pérez:')
    expect(text).toContain('*Luis Gómez* registró una *tardanza en el ingreso* del 12/10/2026 a las *07:52*. (N° 2)')
  })

  it('quita la frase de fecha y hora si faltan', () => {
    const text = buildWhatsAppMessage({ phone: '987654321', studentName: 'Luis Gómez', type: 'LATE' })
    expect(text).toContain('*tardanza en el ingreso*.')
    expect(text).not.toMatch(/del\s|a las/)
    expect(text).toContain('Estimado padre, madre o apoderado:')
  })

  it('no deja párrafos vacíos cuando no hay incumplimientos ni observación', () => {
    const text = buildWhatsAppMessage({ ...base, type: 'REGULATION' })
    expect(text).not.toMatch(/\n{3,}/)
  })

  it('usa la plantilla personalizada cuando existe', () => {
    const text = buildWhatsAppMessage({ ...base, type: 'LATE', time: '08:01' }, { LATE: 'Hola {apoderado}, {alumno} llegó a las {hora}.' })
    expect(text).toBe('Hola Ana Pérez, Luis Gómez llegó a las 08:01.')
  })

  it('ignora una plantilla personalizada vacía', () => {
    const text = buildWhatsAppMessage({ ...base, type: 'ABSENCE' }, { ABSENCE: '   ' })
    expect(text).toContain('no registra ingreso a la institución el 12/10/2026')
  })
})

describe('renderWhatsAppTemplate', () => {
  it('no toca palabras normales como "el" dentro del texto', () => {
    expect(renderWhatsAppTemplate('Hoy el alumno {alumno} llegó.', { ...base, type: 'LATE' })).toBe('Hoy el alumno Luis Gómez llegó.')
  })

  it('deja intactos los marcadores desconocidos', () => {
    expect(renderWhatsAppTemplate('{otro} {alumno}', { ...base, type: 'LATE' })).toBe('{otro} Luis Gómez')
  })
})
