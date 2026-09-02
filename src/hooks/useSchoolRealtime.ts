import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type RealtimeTable =
  | 'students'
  | 'classrooms'
  | 'guardians'
  | 'student_guardians'
  | 'attendance'
  | 'presentation_controls'
  | 'presentation_violations'
  | 'notifications'
  | 'alerts'
  | 'attendance_closures'
  | 'audit_logs'
  | 'historical_import_batches'
  | 'historical_import_records'
  | 'school_settings'

const TABLES: RealtimeTable[] = [
  'students',
  'classrooms',
  'guardians',
  'student_guardians',
  'attendance',
  'presentation_controls',
  'presentation_violations',
  'notifications',
  'alerts',
  'attendance_closures',
  'audit_logs',
  'historical_import_batches',
  'historical_import_records',
  'school_settings',
]

/**
 * Canal Realtime global del sistema.
 *
 * - Invalida inmediatamente los datos centrales ante cualquier cambio operativo.
 * - Expone revision para que los módulos que consultan datos propios se refresquen.
 * - Agrupa ráfagas de eventos (p.ej. control + violaciones + notificación) en una sola recarga.
 * - El polling de useNetworkSync queda únicamente como fallback.
 */
export function useSchoolRealtime(onChange: () => void | Promise<void>) {
  const callbackRef = useRef(onChange)
  const timerRef = useRef<number | null>(null)
  const [connected, setConnected] = useState(false)
  const [revision, setRevision] = useState(0)
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)
  const [lastTable, setLastTable] = useState<RealtimeTable | null>(null)

  useEffect(() => {
    callbackRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const requestRefresh = (table: RealtimeTable) => {
      setLastTable(table)
      setLastEventAt(new Date().toISOString())
      // Una acción puede modificar varias tablas casi simultáneamente.
      // Esperamos solo 120 ms y hacemos una única invalidación/recarga por ráfaga.
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setRevision((value) => value + 1)
        void callbackRef.current()
      }, 120)
    }

    let channel = supabase.channel('tesla-school-global-realtime')

    TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          window.dispatchEvent(new CustomEvent('tesla-realtime-event', {
            detail: { table, event: payload.eventType, newRecord: payload.new, oldRecord: payload.old },
          }))
          requestRefresh(table)
        },
      )
    })

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
    })

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      setConnected(false)
      void supabase.removeChannel(channel)
    }
  }, [])

  return { connected, revision, lastEventAt, lastTable }
}
