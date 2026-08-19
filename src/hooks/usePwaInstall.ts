import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform?: string
  }>
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] =
    useState<InstallPromptEvent | null>(null)

  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const checkInstalled = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches

      const iosStandalone =
        (window.navigator as Navigator & {
          standalone?: boolean
        }).standalone === true

      setInstalled(standalone || iosStandalone)
    }

    checkInstalled()

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()

      console.log('PWA lista para instalar')

      setPromptEvent(event as InstallPromptEvent)
    }

    const handleInstalled = () => {
      console.log('PWA instalada')

      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt
    )

    window.addEventListener(
      'appinstalled',
      handleInstalled
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )

      window.removeEventListener(
        'appinstalled',
        handleInstalled
      )
    }
  }, [])

  async function install() {
    if (!promptEvent) {
      console.warn(
        'El navegador no entregó el prompt de instalación.'
      )

      return false
    }

    await promptEvent.prompt()

    const result = await promptEvent.userChoice

    if (result.outcome === 'accepted') {
      setInstalled(true)
    }

    setPromptEvent(null)

    return result.outcome === 'accepted'
  }

  return {
    installAvailable: Boolean(promptEvent) && !installed,
    installed,
    install,
  }
}
