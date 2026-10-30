// Service worker: la app funciona sin conexión. Sube VERSION cuando cambies archivos
// para que los móviles descarguen la versión nueva.
const VERSION = 'minichef-v8';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/calc.js', 'js/dia.js', 'js/progreso.js', 'js/compra.js', 'js/repo.js', 'js/store.js', 'js/ui.js',
  'js/views/grafico.js', 'js/views/progreso.js', 'js/views/fuerza.js', 'js/views/hoy.js', 'js/views/compra.js', 'js/views/stock.js', 'js/views/recetas.js', 'js/views/editor.js', 'js/views/productos.js', 'js/views/ajustes.js',
  'data/products.json', 'data/recipes.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Red primero para el código (así ves los cambios al instante con conexión); caché si no hay red.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
