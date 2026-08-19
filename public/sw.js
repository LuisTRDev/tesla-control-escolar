const CACHE_NAME = 'tesla-control-v0.7.1'

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/images/logo-nikola-tesla.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
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

  // Solo cacheamos recursos de nuestro propio dominio.
  if (url.origin !== self.location.origin) return

  // Navegaciones: network-first con fallback al index.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || !response.ok) {
            return response
          }

          const responseToCache = response.clone()

          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) =>
                cache.put('/index.html', responseToCache)
              )
          )

          return response
        })
        .catch(async () => {
          const cached = await caches.match('/index.html')

          return (
            cached ||
            new Response('Sin conexión', {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
              },
            })
          )
        })
    )

    return
  }

  // Recursos estáticos: cache-first.
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      try {
        const networkResponse = await fetch(request)

        if (
          networkResponse &&
          networkResponse.ok &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone()

          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) =>
                cache.put(request, responseToCache)
              )
          )
        }

        return networkResponse
      } catch {
        return new Response('', {
          status: 503,
          statusText: 'Offline',
        })
      }
    })
  )
})