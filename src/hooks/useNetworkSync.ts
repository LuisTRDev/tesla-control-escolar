import { useCallback, useEffect, useRef, useState } from 'react'
import { getMeta, getSyncConflicts, listPendingOperations } from '@/lib/offlineDb'
import { flushSyncQueue, type SyncResult } from '@/services/syncService'
import { registerPeriodicRefresh, requestBackgroundSync } from '@/lib/nativeFeatures'

export type NetworkSyncState = {
  online: boolean
  syncing: boolean
  pending: number
  lastSync: string | null
  /** Operaciones que ya fallaron al menos una vez (se muestran en rojo en el panel). */
  failing: number
  /** Operaciones que el servidor rechazó: ya no se reintentan solas, necesitan revisión. */
  blocked: number
  /** Conflictos resueltos automáticamente que el auxiliar aún no revisó. */
  conflicts: number
  lastResult: SyncResult | null
  syncNow: () => Promise<void>
  retry: (ids: string[]) => Promise<void>
}

export function useNetworkSync(onPull?: () => Promise<void>, intervalMs = 15_000): NetworkSyncState {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [failing, setFailing] = useState(0)
  const [blocked, setBlocked] = useState(0)
  const [conflicts, setConflicts] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  const refreshState = useCallback(async () => {
    const [items, last, conflictList] = await Promise.all([listPendingOperations(), getMeta<string>('last_sync'), getSyncConflicts()])
    setPending(items.length)
    // Con cambios sin enviar se pide a Android que despierte la app al volver la conexión.
    if (items.some((item) => !item.blocked)) void requestBackgroundSync()
    setFailing(items.filter((item) => item.lastError).length)
    setBlocked(items.filter((item) => item.blocked).length)
    setConflicts(conflictList.length)
    setLastSync(last)
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncing) { await refreshState(); return }
    setSyncing(true)
    try {
      const result = await flushSyncQueue()
      if (result.sent || result.failed || result.conflicts || result.blocked) setLastResult(result)
      if (onPull) await onPull()
    } finally {
      setSyncing(false)
      await refreshState()
    }
  }, [onPull, refreshState, syncing])

  const retry = useCallback(async (ids: string[]) => {
    if (!navigator.onLine) { await refreshState(); return }
    setSyncing(true)
    try {
      const result = await flushSyncQueue({ onlyIds: ids })
      setLastResult(result)
      if (result.sent && onPull) await onPull()
    } finally {
      setSyncing(false)
      await refreshState()
    }
  }, [onPull, refreshState])

  useEffect(() => { void refreshState() }, [refreshState])
  useEffect(() => { void registerPeriodicRefresh() }, [])

  // El service worker despierta la app (sincronización en segundo plano / periódica).
  const syncNowRef = useRef(syncNow)
  useEffect(() => { syncNowRef.current = syncNow }, [syncNow])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type
      if (type === 'FLUSH_QUEUE') {
        const reply = event.ports[0]
        void (async () => {
          try {
            await syncNowRef.current()
            const left = (await listPendingOperations()).filter((item) => !item.blocked).length
            reply?.postMessage({ ok: true, remaining: left })
          } catch {
            reply?.postMessage({ ok: false })
          }
        })()
      } else if (type === 'REFRESH_DATA') {
        void syncNowRef.current()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
  useEffect(() => {
    const updateQueue = () => { void refreshState() }
    window.addEventListener('tesla-sync-queue-changed', updateQueue)
    return () => window.removeEventListener('tesla-sync-queue-changed', updateQueue)
  }, [refreshState])

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void syncNow() }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [syncNow])

  useEffect(() => {
    const timer = window.setInterval(() => { if (navigator.onLine) void syncNow() }, intervalMs)
    const visibility = () => { if (document.visibilityState === 'visible' && navigator.onLine) void syncNow() }
    document.addEventListener('visibilitychange', visibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [intervalMs, syncNow])

  return { online, syncing, pending, lastSync, failing, blocked, conflicts, lastResult, syncNow, retry }
}
