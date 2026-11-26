// ÇekÇevir model paketleri: indirme, kalıcı saklama, yükleme ve çalıştırma.
// Her paket (çeviri yapay zekası, ses tanıma) aynı mantıkla çalışır.
import { downloadModel, clearPartial, partialBytes } from './downloader.js';

const CACHE_NAME = 'transformers-cache';

export async function storageInfo() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { quota: est?.quota || 0, usage: est?.usage || 0, persisted: !!persisted };
  } catch (_) { return { quota: 0, usage: 0, persisted: false }; }
}

// cfg: { id, modelId, task, dtype, files, sizeMB }
export function createPack(cfg) {
  const READY_FLAG = `cc:pack:${cfg.id}`;
  let worker = null;
  let seq = 0;
  let installing = null;
  const pending = new Map();
  const listeners = new Set();

  const pack = {
    ...cfg,
    status: 'none', // none | downloading | loading | ready | error
    progress: { loaded: 0, total: 0 },
    error: '',
    threads: 1,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isInstalled,
    install,
    uninstall,
    warmUp,
    verifyCache,
    partialMB: async () => Math.round((await partialBytes(cfg.modelId)) / 1e6),
    run: (msg) => call({ type: 'run', cfg: workerCfg(), ...msg }),
  };
  const workerCfg = () => ({ modelId: cfg.modelId, task: cfg.task, dtype: cfg.dtype });
  const emit = () => { for (const fn of listeners) { try { fn(pack); } catch (_) { /* yok say */ } } };
  const setStatus = (s, extra = {}) => { Object.assign(pack, { status: s }, extra); emit(); };

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./pack.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return;
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.type === 'error') job.reject(new Error(data.message));
      else job.resolve(data);
    };
    worker.onerror = (e) => {
      for (const job of pending.values()) job.reject(new Error(e.message || 'worker'));
      pending.clear();
      worker = null;
      setStatus('error', { error: e.message || 'Yapay zeka başlatılamadı' });
    };
    return worker;
  }

  function call(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, ...msg }, transfer || []);
    });
  }
  pack.call = call;

  function isInstalled() {
    try { return localStorage.getItem(READY_FLAG) === '1'; } catch (_) { return false; }
  }

  async function verifyCache() {
    try {
      if (!('caches' in self)) return false;
      const cache = await caches.open(CACHE_NAME);
      const urls = (await cache.keys()).map((r) => r.url);
      return cfg.files.filter((f) => f.endsWith('.onnx'))
        .every((f) => urls.some((u) => u.includes(`${cfg.modelId}/resolve/main/${f}`)));
    } catch (_) { return false; }
  }

  function install() {
    if (!installing) installing = doInstall().finally(() => { installing = null; });
    return installing;
  }

  async function doInstall() {
    try { await navigator.storage?.persist?.(); } catch (_) { /* izin verilmeyebilir */ }
    const fromCache = await verifyCache();
    setStatus(fromCache ? 'loading' : 'downloading', { error: '', progress: { loaded: 0, total: 0 } });
    try {
      if (!fromCache) {
        await downloadModel({
          modelId: cfg.modelId, files: cfg.files, cacheName: CACHE_NAME,
          onProgress: (p) => { pack.progress = p; emit(); },
        });
        setStatus('loading', { progress: { loaded: 0, total: 0 } });
      }
      const res = await call({ type: 'load', cfg: workerCfg() });
      try { localStorage.setItem(READY_FLAG, '1'); } catch (_) { /* yok say */ }
      setStatus('ready', { threads: res.threads || 1 });
    } catch (err) {
      const msg = String(err?.message || '');
      const network = !navigator.onLine || /fetch|network|load failed|abort/i.test(msg);
      const quota = /quota|space|storage/i.test(msg);
      setStatus('error', { error: network
        ? 'İnternet bağlantısı koptu veya çok yavaş. Bağlanınca tekrar dene; tamamlanan parçalar silinmez.'
        : quota ? 'Cihazda yeterli boş alan yok. Biraz yer açıp tekrar dene.'
        : (msg || 'İndirme başarısız') });
    }
  }

  // Uygulama açılışında: paket daha önce indirildiyse arka planda yükle
  async function warmUp() {
    if (!isInstalled()) return;
    if (!(await verifyCache())) {
      try { localStorage.removeItem(READY_FLAG); } catch (_) { /* yok say */ }
      setStatus('none');
      return;
    }
    install();
  }

  async function uninstall() {
    if (worker) { worker.terminate(); worker = null; }
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const req of await cache.keys()) if (req.url.includes(`/${cfg.modelId}/`)) await cache.delete(req);
    } catch (_) { /* yok say */ }
    try { localStorage.removeItem(READY_FLAG); } catch (_) { /* yok say */ }
    await clearPartial(cfg.modelId);
    setStatus('none', { progress: { loaded: 0, total: 0 } });
  }

  return pack;
}
