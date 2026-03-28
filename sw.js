// ============================================================
//  FIELDOC — sw.js
//  Service Worker — cache offline
//  Versión·A · v1.0
// ============================================================

const CACHE_NAME = 'fieldoc-v1';

// Archivos que se cachean al instalar
const ARCHIVOS_CACHE = [
  './fieldoc.html',
  './db.js',
  './api.js',
  './sync.js',
  './app.js',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap'
];

// ── Instalación: cachear archivos estáticos ──────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activación: limpiar cachés antiguas ──────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first para estáticos, network-first para API ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Las llamadas al Apps Script siempre van a red — nunca cachear
  if (url.includes('script.google.com')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ ok: false, error: 'Sin conexión' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Para todo lo demás: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cachear respuestas válidas de fuentes conocidas
        if (response.ok && (
          url.includes('fonts.googleapis.com') ||
          url.includes('fonts.gstatic.com')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Si falla y es el HTML principal, servir desde caché
        if (e.request.destination === 'document') {
          return caches.match('./fieldoc.html');
        }
      });
    })
  );
});
