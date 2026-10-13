import { beforeAll, describe, expect, it, vi } from 'vitest'

// Historial mínimo del navegador: pushState agrega, back() quita y dispara popstate (asíncrono, como en Chrome).
const listeners: Array<() => void> = []
let depth = 0
const fakeWindow = {
  history: {
    pushState: () => { depth += 1 },
    back: () => { depth = Math.max(0, depth - 1); setTimeout(() => listeners.forEach((fn) => fn()), 0) },
  },
  addEventListener: (_type: string, fn: () => void) => { listeners.push(fn) },
}
const pressBack = () => fakeWindow.history.back()

let registerBackClose: typeof import('./backClose').registerBackClose
let RELEASE_DELAY_MS: number

beforeAll(async () => {
  vi.stubGlobal('window', fakeWindow)
  ;({ registerBackClose, RELEASE_DELAY_MS } = await import('./backClose'))
})

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('botón atrás de Android', () => {
  it('cierra lo último abierto y conserva el resto', async () => {
    const closed: string[] = []
    registerBackClose(() => closed.push('modulo'))
    registerBackClose(() => closed.push('dialogo'))
    expect(depth).toBe(1) // un solo centinela aunque haya dos abiertos

    pressBack(); await flush()
    expect(closed).toEqual(['dialogo'])
    expect(depth).toBe(1) // queda el módulo: se repone el centinela

    pressBack(); await flush()
    expect(closed).toEqual(['dialogo', 'modulo'])
    expect(depth).toBe(0)
  })

  it('al cerrar con la X retira el centinela sin cerrar nada más', async () => {
    const close = vi.fn()
    const unregister = registerBackClose(close)
    expect(depth).toBe(1)
    unregister()
    await flush(RELEASE_DELAY_MS + 20)
    expect(depth).toBe(0)
    expect(close).not.toHaveBeenCalled()
  })

  it('reutiliza el centinela si al cerrar uno se abre otro enseguida', async () => {
    const closed: string[] = []
    const unregisterAlert = registerBackClose(() => closed.push('alertas'))
    unregisterAlert()
    registerBackClose(() => closed.push('expediente'))
    await flush(RELEASE_DELAY_MS + 20)
    expect(depth).toBe(1)

    pressBack(); await flush()
    expect(closed).toEqual(['expediente'])
    expect(depth).toBe(0)
  })
})
