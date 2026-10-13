/**
 * Reglas para resolver conflictos cuando dos dispositivos registran lo mismo sin
 * conexión y ambos sincronizan después (p. ej. dos auxiliares marcan al mismo alumno).
 *
 * - Entrada y salida: vale la hora MÁS TEMPRANA (es el momento real en que pasó).
 * - Presentación: una observación con incidencias no se pierde por un "conforme"
 *   posterior; si ambas tienen incidencias, se unen.
 */

export type TimeResolution = 'KEEP_REMOTE' | 'USE_LOCAL'

/** Horas "HH:MM" o "HH:MM:SS". Si son iguales, se conserva lo que ya está en el servidor. */
export function resolveEarliestTime(remoteTime: string | null | undefined, localTime: string): TimeResolution {
  const remote = (remoteTime ?? '').slice(0, 5)
  if (!remote) return 'USE_LOCAL'
  // Una marca sin hora (tardanza sin hora) nunca reemplaza a una con hora conocida.
  if (!localTime) return 'KEEP_REMOTE'
  return localTime.slice(0, 5) < remote ? 'USE_LOCAL' : 'KEEP_REMOTE'
}

export type PresentationSide = {
  status: 'COMPLIANT' | 'NON_COMPLIANT'
  violations: string[]
  observation: string
}

export type PresentationResolution = {
  action: 'KEEP_REMOTE' | 'USE_LOCAL' | 'MERGE'
  result: PresentationSide
}

export function resolvePresentation(remote: PresentationSide | null, local: PresentationSide): PresentationResolution {
  if (!remote) return { action: 'USE_LOCAL', result: local }
  if (remote.status === 'NON_COMPLIANT' && local.status === 'COMPLIANT') return { action: 'KEEP_REMOTE', result: remote }
  if (remote.status === 'NON_COMPLIANT' && local.status === 'NON_COMPLIANT') {
    const violations = [...new Set([...remote.violations, ...local.violations])].sort()
    const remoteObservation = remote.observation.trim()
    const localObservation = local.observation.trim()
    const sameObservation = !localObservation || localObservation === remoteObservation
    // El local no aporta nada nuevo: se deja el registro del servidor tal cual.
    if (violations.length === new Set(remote.violations).size && sameObservation) return { action: 'KEEP_REMOTE', result: remote }
    const observation = [remoteObservation, sameObservation ? '' : localObservation].filter(Boolean).join(' / ')
    return { action: 'MERGE', result: { status: 'NON_COMPLIANT', violations, observation } }
  }
  return { action: 'USE_LOCAL', result: local }
}

export type SyncConflict = {
  id: string
  at: string
  kind: 'ENTRY' | 'EXIT' | 'PRESENTATION'
  studentId: string
  date: string
  resolution: 'KEEP_REMOTE' | 'USE_LOCAL' | 'MERGE'
  localValue: string
  remoteValue: string
}

export const CONFLICT_KIND_LABELS: Record<SyncConflict['kind'], string> = {
  ENTRY: 'Entrada',
  EXIT: 'Salida',
  PRESENTATION: 'Presentación',
}

export function describeConflict(conflict: SyncConflict): string {
  if (conflict.kind === 'PRESENTATION') {
    if (conflict.resolution === 'MERGE') return `Otro dispositivo también registró incidencias. Se unieron: ${conflict.remoteValue} + ${conflict.localValue}.`
    if (conflict.resolution === 'KEEP_REMOTE') return `Otro dispositivo ya había registrado "${conflict.remoteValue}". Se conservó ese registro en lugar de "${conflict.localValue}".`
    return `Se reemplazó "${conflict.remoteValue}" por "${conflict.localValue}".`
  }
  const what = conflict.kind === 'ENTRY' ? 'la entrada' : 'la salida'
  return conflict.resolution === 'KEEP_REMOTE'
    ? `Otro dispositivo ya había marcado ${what} a las ${conflict.remoteValue}. Se conservó esa hora (este equipo tenía ${conflict.localValue}).`
    : `Otro dispositivo marcó ${what} a las ${conflict.remoteValue}, pero este equipo tenía una hora anterior (${conflict.localValue}) y se guardó esa.`
}
