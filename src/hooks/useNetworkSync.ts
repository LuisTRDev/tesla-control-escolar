import { useCallback, useEffect, useState } from 'react'
import { getMeta, listPendingOperations } from '@/lib/offlineDb'
import { flushSyncQueue } from '@/services/syncService'

export type NetworkSyncState = {
  online: boolean
  syncing: boolean
  pending: number
  lastSync: string | null
  syncNow: () => Promise<void>
}

export function useNetworkSync(onPull?: () => Promise<void>, intervalMs = 120_000): NetworkSyncState {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const refreshState = useCallback(async () => {
    const [items, last] = await Promise.all([listPendingOperations(), getMeta<string>('last_sync')])
    setPending(items.length)
    setLastSync(last)
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncing) { await refreshState(); return }
    setSyncing(true)
    try {
      await flushSyncQueue()
      if (onPull) await onPull()
    } finally {
      setSyncing(false)
      await refreshState()
    }
  }, [onPull, refreshState, syncing])

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

  return { online, syncing, pending, lastSync, syncNow }
}
