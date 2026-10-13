/** Atajos de teclado para PC. La lista también se muestra en la Guía de uso. */

export const SHORTCUTS: Array<{ keys: string[]; description: string; where: string }> = [
  { keys: ['/'], description: 'Ir al buscador de alumnos', where: 'Lista diaria y Modo rápido' },
  { keys: ['Enter'], description: 'Marcar la entrada del alumno buscado (si queda uno solo sin marcar)', where: 'En el buscador' },
  { keys: ['Esc'], description: 'Limpiar la búsqueda; si ya está vacía, cerrar el Modo rápido', where: 'En el buscador' },
  { keys: ['Q'], description: 'Abrir el Modo rápido', where: 'Lista diaria' },
  { keys: ['S'], description: 'Abrir el panel de sincronización', where: 'Lista diaria' },
  { keys: ['?'], description: 'Abrir esta guía de uso', where: 'Lista diaria' },
]

/** true si el usuario está escribiendo: los atajos de una letra no deben dispararse. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** true si hay un diálogo o panel a pantalla completa abierto encima de la lista. */
export function hasOpenOverlay(): boolean {
  return Boolean(document.querySelector('[role="dialog"], .fixed.inset-0:not(.lg\\:hidden)'))
}

export type EnterTarget<T> = { kind: 'mark'; item: T } | { kind: 'none' } | { kind: 'many'; count: number }

/**
 * Qué hacer al pulsar Enter en el buscador: marcar solo si queda exactamente un
 * alumno sin marcar entre los resultados (evita marcar al equivocado).
 */
export function pickEnterTarget<T>(unmarkedMatches: T[]): EnterTarget<T> {
  if (unmarkedMatches.length === 1) return { kind: 'mark', item: unmarkedMatches[0] }
  if (unmarkedMatches.length === 0) return { kind: 'none' }
  return { kind: 'many', count: unmarkedMatches.length }
}
