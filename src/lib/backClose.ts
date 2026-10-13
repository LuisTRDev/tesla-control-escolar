import { useEffect, useRef } from 'react'

/**
 * Botón / gesto "atrás" de Android: cierra el modal, hoja o módulo abierto más reciente
 * en vez de salir de la app, como en una app nativa.
 *
 * Mientras haya algo abierto se mantiene UNA entrada extra en el historial (centinela).
 * Al pulsar atrás el navegador la consume: se cierra lo último abierto y, si queda algo
 * más abierto, se vuelve a poner el centinela. Si todo se cierra con la X, el centinela
 * se retira solo para que el siguiente "atrás" no quede sin efecto.
 */
type Entry = { close: () => void }

const stack: Entry[] = []
let sentinel = false
let ignoreNextPop = false
let releaseTimer: ReturnType<typeof setTimeout> | undefined
let listening = false

/** Espera antes de retirar el centinela: si al cerrar uno se abre otro (alerta → expediente) se reutiliza. */
export const RELEASE_DELAY_MS = 80

function pushSentinel() {
  if (sentinel) return
  window.history.pushState({ teslaOverlay: true }, '')
  sentinel = true
}

function onPopState() {
  if (ignoreNextPop) { ignoreNextPop = false; return }
  if (!sentinel) return
  sentinel = false
  const top = stack.pop()
  top?.close()
  if (stack.length > 0) pushSentinel()
}

function scheduleRelease() {
  clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    if (stack.length === 0 && sentinel) {
      sentinel = false
      ignoreNextPop = true
      window.history.back()
    }
  }, RELEASE_DELAY_MS)
}

/**
 * Registra algo abierto que el botón atrás debe cerrar. Devuelve la función a llamar
 * cuando se cierra por otra vía (X, guardar, tocar fuera).
 */
export function registerBackClose(close: () => void): () => void {
  if (!listening) { window.addEventListener('popstate', onPopState); listening = true }
  const entry: Entry = { close }
  stack.push(entry)
  pushSentinel()
  return () => {
    const index = stack.indexOf(entry)
    if (index === -1) return // ya lo cerró el botón atrás
    stack.splice(index, 1)
    if (stack.length === 0) scheduleRelease()
  }
}

export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    return registerBackClose(() => closeRef.current())
  }, [open])
}
