const CACHE_NAME = 'tesla-control-v0.7.12'
// Archivos que llegan desde el menú Compartir del teléfono (manifest share_target). La app los lee y los borra.
const SHARE_CACHE = 'tesla-shared-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/images/logo-nikola-tesla.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
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

// ---- Sincronización en segundo plano ----------------------------------------
// El service worker no puede leer la sesión de Supabase (vive en localStorage), así que no
// envía los datos él mismo: despierta a la app abierta (aunque esté en segundo plano) para que
// vacíe su cola. Si no hay ninguna ventana, falla a propósito y el navegador reintenta luego.
const SYNC_TAG = 'tesla-sync-queue'
const REFRESH_TAG = 'tesla-refresh'
const FLUSH_TIMEOUT_MS = 25000

async function askClientsToFlush() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (windows.length === 0) throw new Error('No hay ventana abierta para sincronizar')
  const results = await Promise.all(windows.map((client) => new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve({ ok: false }), FLUSH_TIMEOUT_MS)
    channel.port1.onmessage = (message) => { clearTimeout(timer); resolve(message.data) }
    client.postMessage({ type: 'FLUSH_QUEUE' }, [channel.port2])
  })))
  // Si ninguna ventana terminó con la cola vacía, se rechaza para que el navegador reintente.
  if (!results.some((result) => result && result.ok && result.remaining === 0)) throw new Error('La cola sigue con pendientes')
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(askClientsToFlush())
})

// Sincronización periódica (solo app instalada y con uso frecuente): mantiene al día la pantalla de inicio.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== REFRESH_TAG) return
  event.waitUntil((async () => {
    try {
      const response = await fetch('/index.html', { cache: 'no-store' })
      if (response.ok) await (await caches.open(CACHE_NAME)).put('/index.html', response)
    } catch {
      // Sin conexión: se intentará en el próximo ciclo.
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage({ type: 'REFRESH_DATA' }))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Guarda los archivos compartidos y abre la app; ella los toma de la caché (src/lib/sharedFiles.ts).
async function receiveSharedFiles(request) {
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((file) => typeof file !== 'string' && file.size > 0)
    const cache = await caches.open(SHARE_CACHE)
    for (const key of await cache.keys()) await cache.delete(key)
    let index = 0
    for (const file of files) {
      await cache.put('/shared/' + index++, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'documento') } }))
    }
    return Response.redirect('/?shared=' + files.length, 303)
  } catch {
    return Response.redirect('/?shared=0', 303)
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(receiveSharedFiles(request))
    return
  }

  if (request.method !== 'GET') return
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
