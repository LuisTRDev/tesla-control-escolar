import { useCallback, useEffect, useState } from 'react'

const UPDATE_EVENT = 'tesla-pwa-update-available'

export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  const checkForWaitingWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.getRegistration()
    if (registration?.waiting && navigator.serviceWorker.controller) {
      setUpdateAvailable(true)
    }
  }, [])

  useEffect(() => {
    void checkForWaitingWorker()

    const handleUpdateAvailable = () => setUpdateAvailable(true)
    window.addEventListener(UPDATE_EVENT, handleUpdateAvailable)

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdateAvailable)
    }
  }, [checkForWaitingWorker])

  const updateNow = useCallback(async () => {
    if (!('serviceWorker' in navigator) || updating) return

    const registration = await navigator.serviceWorker.getRegistration()
    const waitingWorker = registration?.waiting

    if (!waitingWorker) {
      setUpdateAvailable(false)
      await registration?.update()
      return
    }

    setUpdating(true)

    const controllerChanged = new Promise<void>((resolve) => {
      const handler = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handler)
        resolve()
      }
      navigator.serviceWorker.addEventListener('controllerchange', handler)
    })

    waitingWorker.postMessage({ type: 'SKIP_WAITING' })

    // Esperamos a que la nueva versión tome el control antes de recargar.
    await Promise.race([
      controllerChanged,
      new Promise<void>((resolve) => window.setTimeout(resolve, 4000)),
    ])

    window.location.reload()
  }, [updating])

  const dismiss = useCallback(() => {
    // Solo se oculta durante esta sesión. Si se reinicia la app y la actualización
    // sigue pendiente, se volverá a mostrar para que no quede olvidada.
    setUpdateAvailable(false)
  }, [])

  return {
    updateAvailable,
    updating,
    updateNow,
    dismiss,
  }
}
