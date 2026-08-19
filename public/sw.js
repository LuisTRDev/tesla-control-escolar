const CACHE_NAME = 'tesla-control-v0.7.2'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/images/logo-nikola-tesla.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  // Importante: NO hacemos skipWaiting automáticamente.
  // La versión nueva queda esperando hasta que el usuario pulse "Actualizar ahora".
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegación: red primero; si no hay conexión, usamos el shell cacheado.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response?.ok) {
            const copy = response.clone()
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
            )
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match('/index.html')
          return cached || new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        })
    )
    return
  }

  // Recursos estáticos: caché primero y red como respaldo.
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached

      try {
        const response = await fetch(request)

        if (response?.ok && response.type === 'basic') {
          const copy = response.clone()
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          )
        }

        return response
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' })
      }
    })
  )
})
