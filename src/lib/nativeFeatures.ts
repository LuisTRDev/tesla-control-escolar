import { useEffect } from 'react'
import { reportError } from '@/lib/security'

/**
 * Funciones del sistema para que la PWA instalada se comporte como app nativa (Android).
 * Todas son opcionales: si el navegador no las soporta, no hacen nada.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }

/** Mantiene la pantalla encendida mientras `active` (modo rápido, PDA, panel TV). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!active || !wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const next = await wakeLock.request('screen')
        if (cancelled) void next.release()
        else sentinel = next
      } catch {
        // Ahorro de batería activo o permiso denegado: la pantalla se apaga como siempre.
      }
    }
    // El sistema suelta el bloqueo al cambiar de app; se vuelve a pedir al regresar.
    const onVisibility = () => { if (document.visibilityState === 'visible') void acquire() }
    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Número sobre el ícono de la app instalada (cambios sin sincronizar). 0 lo quita. */
export function setAppBadge(count: number) {
  const nav = navigator as BadgeNavigator
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined)
    else void nav.clearAppBadge?.().catch(() => undefined)
  } catch {
    // Sin soporte de Badging API.
  }
}

/**
 * Pide almacenamiento persistente: sin esto Android puede borrar IndexedDB (la cola
 * offline y la caché) cuando el teléfono se queda sin espacio. En la app instalada
 * Chrome lo concede sin preguntar.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return
    if (await navigator.storage.persisted()) return
    await navigator.storage.persist()
  } catch (error) {
    reportError('persistent-storage', error)
  }
}

/** true si el teléfono permite compartir archivos (menú "Compartir" de Android → WhatsApp, Drive...). */
export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> }
  periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> }
}

/**
 * Pide al navegador que despierte la app cuando vuelva la conexión para vaciar la cola
 * offline (Background Sync). Sin soporte (iOS, Firefox) no hace nada: la cola se vacía
 * igual al abrir la app o al volver a primer plano.
 */
export async function requestBackgroundSync() {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration
    await registration.sync?.register('tesla-sync-queue')
  } catch (error) {
    reportError('background-sync', error)
  }
}

/** Sincronización periódica (cada ~3 h si Chrome la concede a la app instalada). */
export async function registerPeriodicRefresh() {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration
    if (!registration.periodicSync) return
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
    if (status.state !== 'granted') return
    await registration.periodicSync.register('tesla-refresh', { minInterval: 3 * 60 * 60 * 1000 })
  } catch (error) {
    reportError('periodic-sync', error)
  }
}
