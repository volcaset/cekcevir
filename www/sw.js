// ÇekÇevir service worker: uygulamanın internetsiz açılmasını sağlar.
// Sürümü her yayında artır ki telefonlar yeni dosyaları alsın.
const VERSION = 'cekcevir-v0.4.0';
// Dosya adları sürüm içerdiği için bu önbellek uygulama güncellemelerinde silinmez
const RUNTIME = 'cekcevir-runtime-tfjs-4.3.2-ort-1.31.0-dev.20260914';
const RUNTIME_HOSTS = ['https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/'];
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
  './js/engine/ai.js',
  './js/engine/lite-models.js',
  './js/engine/pack.js',
  './js/engine/pack.worker.js',
  './js/recorder.js',
  './js/engine/downloader.js',
  './data/tatoeba-tr-ar.json',
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
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('cekcevir-v') && k !== VERSION) || (k.startsWith('cekcevir-runtime-') && k !== RUNTIME)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isRuntimeCdn = RUNTIME_HOSTS.some((h) => req.url.startsWith(h));
  if (url.origin !== self.location.origin && !isRuntimeCdn) return; // model dosyaları kendi önbelleğini kullanır
  if (url.pathname.startsWith('/models/')) return; // model parçaları: indirici kendisi saklar
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

  // Yapay zeka çalışma motoru (büyük wasm): ayrı, sürümden bağımsız kalıcı önbellek
  if (isRuntimeCdn || url.pathname.includes('/vendor/ort/')) {
    event.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
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
