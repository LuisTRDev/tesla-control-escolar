import { describe, expect, it } from 'vitest'
import { detectInstallPlatform, inviteAllowed, nextInviteMemory } from '@/lib/installPrompt'

const DAY = 24 * 60 * 60 * 1000

describe('detectInstallPlatform', () => {
  it('usa el diálogo del sistema cuando el navegador lo entregó', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14)', true)).toBe('prompt')
  })
  it('reconoce iPhone y iPad (incluido iPadOS que se anuncia como Mac)', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', false)).toBe('ios')
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false, 5)).toBe('ios')
  })
  it('en Android sin diálogo explica el menú del navegador', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 13)', false)).toBe('android-menu')
  })
  it('en PC sin diálogo no hay nada que mostrar', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0)', false)).toBe('none')
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false, 0)).toBe('none')
  })
})

describe('memoria de la invitación', () => {
  it('sin historial se puede mostrar', () => {
    expect(inviteAllowed({ count: 0, until: 0 }, Date.now())).toBe(true)
  })
  it('la primera vez que se descarta espera 7 días y luego 90', () => {
    const now = 1_000_000
    const first = nextInviteMemory({ count: 0, until: 0 }, now)
    expect(first).toEqual({ count: 1, until: now + 7 * DAY })
    expect(inviteAllowed(first, now + 6 * DAY)).toBe(false)
    expect(inviteAllowed(first, now + 7 * DAY)).toBe(true)
    expect(nextInviteMemory(first, now).until).toBe(now + 90 * DAY)
  })
})
