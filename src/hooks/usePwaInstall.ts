import { useSyncExternalStore } from 'react'
import { getInstallSnapshot, runInstallPrompt, subscribeInstall } from '@/lib/installPrompt'

/** Estado de instalación de la PWA. El aviso del navegador se captura al arrancar la app (ver lib/installPrompt). */
export function usePwaInstall() {
  const { prompt, installed } = useSyncExternalStore(subscribeInstall, getInstallSnapshot)
  return {
    installAvailable: Boolean(prompt) && !installed,
    installed,
    install: runInstallPrompt,
  }
}
