// ÇekÇevir service worker: uygulamanın internetsiz açılmasını sağlar.
// Sürümü her yayında artır ki telefonlar yeni dosyaları alsın.
const VERSION = 'cekcevir-v0.1.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/speech.js',
  './js/engine/translator.js',
  './js/engine/transliterate.js',
  './js/engine/corrections.js',
  './js/data/languages.js',
  './js/data/phrases.js',
  './js/data/regions.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Sadece eski uygulama önbelleklerini sil; yapay zeka model önbelleklerine dokunma
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cekcevir-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // dış kaynaklar (ör. model indirmeleri) kendi önbelleğini kullanır
  if (url.searchParams.has('ping')) return; // internet kontrolü: her zaman gerçek ağa gitsin

  // Sayfa açılışı: önce ağ (güncel kalsın), internet yoksa önbellek
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Diğer dosyalar: önce önbellek, yoksa ağ
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
