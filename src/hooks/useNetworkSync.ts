import { useCallback, useEffect, useState } from 'react'
import { getMeta, getSyncConflicts, listPendingOperations } from '@/lib/offlineDb'
import { flushSyncQueue, type SyncResult } from '@/services/syncService'

export type NetworkSyncState = {
  online: boolean
  syncing: boolean
  pending: number
  lastSync: string | null
  /** Operaciones que ya fallaron al menos una vez (se muestran en rojo en el panel). */
  failing: number
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
  const [conflicts, setConflicts] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  const refreshState = useCallback(async () => {
    const [items, last, conflictList] = await Promise.all([listPendingOperations(), getMeta<string>('last_sync'), getSyncConflicts()])
    setPending(items.length)
    setFailing(items.filter((item) => item.lastError).length)
    setConflicts(conflictList.length)
    setLastSync(last)
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncing) { await refreshState(); return }
    setSyncing(true)
    try {
      const result = await flushSyncQueue()
      if (result.sent || result.failed || result.conflicts) setLastResult(result)
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

  return { online, syncing, pending, lastSync, failing, conflicts, lastResult, syncNow, retry }
}
