import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PwaUpdateNotice from '@/components/PwaUpdateNotice'
import './index.css'
import { installProductionConsoleGuards, reportError } from '@/lib/security'

installProductionConsoleGuards()

const UPDATE_EVENT = 'tesla-pwa-update-available'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PwaUpdateNotice />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')

      const notifyIfWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new Event(UPDATE_EVENT))
        }
      }

      notifyIfWaiting()

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing
        if (!installingWorker) return

        installingWorker.addEventListener('statechange', () => {
          if (
            installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            window.dispatchEvent(new Event(UPDATE_EVENT))
          }
        })
      })

      // Comprobación temprana al cargar. El navegador también realiza sus propias
      // comprobaciones periódicas del service worker.
      await registration.update()
    } catch (error) {
      reportError('service-worker', error)
    }
  })
}
