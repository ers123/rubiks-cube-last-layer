const CACHE = 'cube-last-v2'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png']
const entry = new URL('./index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const html = await fetch(entry, { cache: 'reload' })
    if (!html.ok) throw new Error('App entry is unavailable')
    const source = await html.text()
    const assets = Array.from(source.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g), ([, path]) => path)
    await cache.addAll([...CORE, ...assets].map((path) => new Request(new URL(path, entry), { cache: 'reload' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('cube-last-') && key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const response = await fetch(req)
      if (response.ok) await cache.put(req, response.clone()).catch(() => {})
      return response
    } catch {
      const cached = await cache.match(req, { ignoreVary: true })
      if (cached) return cached
      if (req.mode === 'navigate') return await cache.match(entry) ?? Response.error()
      return Response.error()
    }
  })())
})
