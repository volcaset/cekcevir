// ÇekÇevir model paketleri: indirme, kalıcı saklama, yükleme ve çalıştırma.
// Her paket (çeviri yapay zekası, ses tanıma) aynı mantıkla çalışır.
// Bir paket birden fazla modelden oluşabilir (ör. telefon çevirisi).
import { downloadModel, listSizes, clearPartial, partialBytes } from './downloader.js';

const CACHE_NAME = 'transformers-cache';

export async function storageInfo() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { quota: est?.quota || 0, usage: est?.usage || 0, persisted: !!persisted };
  } catch (_) { return { quota: 0, usage: 0, persisted: false }; }
}

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* yok say */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (_) { /* yok say */ } };

// cfg: { id, key, task, dtype, sizeMB, models: [{ modelId, files }], lowMemory }
export function createPack(cfg) {
  const READY_FLAG = `cc:pack:${cfg.key}`;
  // Model belleğe açılırken sayfa kapanırsa (telefonda bellek taşması) bu işaret kalır
  const BOOT_FLAG = `cc:boot:${cfg.key}`;
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
    crashed: null,
    threads: 1,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isInstalled,
    install,
    uninstall,
    warmUp,
    verifyCache,
    partialMB: async () => {
      let b = 0;
      for (const m of cfg.models) b += await partialBytes(m.modelId);
      return Math.round(b / 1e6);
    },
    run: (msg, transfer) => call({ type: 'run', cfg: workerCfg(), ...msg }, transfer),
  };
  const workerCfg = () => ({ task: cfg.task, dtype: cfg.dtype, lowMemory: !!cfg.lowMemory, models: cfg.models.map((m) => m.modelId) });
  const emit = () => { for (const fn of listeners) { try { fn(pack); } catch (_) { /* yok say */ } } };
  const setStatus = (s, extra = {}) => { Object.assign(pack, { status: s }, extra); emit(); };

  // Geçen açılışta model yüklenirken sayfa çöktüyse otomatik yükleme yapma
  try {
    const b = JSON.parse(lsGet(BOOT_FLAG) || 'null');
    if (b) {
      pack.crashed = b;
      pack.status = 'error';
      pack.error = `Geçen sefer paket belleğe açılırken sayfa kapandı${b.stage ? ' (son adım: ' + b.stage + ')' : ''}. Bu cihazın belleği bu paket için yetmiyor olabilir.`;
    }
  } catch (_) { lsDel(BOOT_FLAG); }
  let booting = null;
  const markBoot = (stage) => { booting = stage; lsSet(BOOT_FLAG, JSON.stringify({ t: Date.now(), stage })); };
  const clearBoot = () => { booting = null; lsDel(BOOT_FLAG); pack.crashed = null; };
  // Sayfa normal kapanırsa (çökme değil) işareti kaldır, geri gelirse geri koy
  addEventListener('pagehide', () => { if (booting) lsDel(BOOT_FLAG); });
  addEventListener('pageshow', () => { if (booting) markBoot(booting); });

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./pack.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const p = data.data || {};
        if (booting && p.file && (p.status === 'initiate' || p.status === 'done')) {
          markBoot(`${p.status === 'done' ? 'açıldı' : 'açılıyor'}: ${p.file.split('/').pop()}`);
        }
        return;
      }
      if (data.type === 'stage') { if (booting) markBoot(data.stage); return; }
      if (data.type === 'fatal') {
        for (const job of pending.values()) job.reject(new Error(data.message));
        pending.clear();
        return;
      }
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.type === 'error') job.reject(new Error(data.message));
      else job.resolve(data);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      // Safari bu olayda çoğu zaman ayrıntı vermez; en olası sebebi yaz
      const detail = e.message
        ? `${e.message}${e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''}`
        : 'Yapay zeka motoru bu tarayıcıda başlatılamadı. Cihazın belleği yetmemiş olabilir; diğer uygulamaları kapatıp tekrar dene.';
      for (const job of pending.values()) job.reject(new Error(detail));
      pending.clear();
      try { worker?.terminate(); } catch (_) { /* yok say */ }
      worker = null;
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

  function isInstalled() { return lsGet(READY_FLAG) === '1'; }

  async function verifyCache() {
    try {
      if (!('caches' in self)) return false;
      const cache = await caches.open(CACHE_NAME);
      const urls = (await cache.keys()).map((r) => r.url);
      return cfg.models.every((m) => m.files.filter((f) => f.endsWith('.onnx'))
        .every((f) => urls.some((u) => u.includes(`${m.modelId}/resolve/main/${f}`))));
    } catch (_) { return false; }
  }

  function install() {
    if (!installing) installing = doInstall().finally(() => { installing = null; });
    return installing;
  }

  async function doInstall() {
    try { await navigator.storage?.persist?.(); } catch (_) { /* izin verilmeyebilir */ }
    clearBoot();
    const fromCache = await verifyCache();
    setStatus(fromCache ? 'loading' : 'downloading', { error: '', progress: { loaded: 0, total: 0 } });
    try {
      if (!fromCache) {
        // Toplam boyutu baştan bil ki ilerleme çubuğu zıplamasın
        const totals = [];
        for (const m of cfg.models) {
          const sizes = await listSizes(m.modelId, m.files, m.base);
          totals.push(m.files.reduce((a, f) => a + (sizes[f] || 0), 0));
        }
        const grand = totals.reduce((a, b) => a + b, 0);
        let before = 0;
        for (let i = 0; i < cfg.models.length; i++) {
          const m = cfg.models[i];
          await downloadModel({
            modelId: m.modelId, files: m.files, base: m.base, cacheName: CACHE_NAME,
            onProgress: (p) => { pack.progress = { loaded: before + p.loaded, total: grand }; emit(); },
          });
          before += totals[i];
        }
        setStatus('loading', { progress: { loaded: 0, total: 0 } });
      }
      markBoot('motor başlıyor');
      const res = await call({ type: 'load', cfg: workerCfg() });
      clearBoot();
      lsSet(READY_FLAG, '1');
      setStatus('ready', { threads: res.threads || 1 });
    } catch (err) {
      clearBoot();
      const msg = String(err?.message || '');
      const network = !navigator.onLine || /fetch|network|load failed|abort/i.test(msg);
      const quota = /quota|space|storage/i.test(msg);
      setStatus('error', { error: network
        ? 'İnternet bağlantısı koptu veya çok yavaş. Bağlanınca tekrar dene; tamamlanan parçalar silinmez.'
        : quota ? 'Cihazda yeterli boş alan yok. Biraz yer açıp tekrar dene.'
        : (msg || 'İndirme başarısız') });
    }
  }

  // Uygulama açılışında: paket daha önce hazırlandıysa arka planda yükle
  async function warmUp() {
    if (pack.crashed || !isInstalled()) return;
    if (!(await verifyCache())) {
      lsDel(READY_FLAG);
      setStatus('none');
      return;
    }
    install();
  }

  async function uninstall() {
    if (worker) { worker.terminate(); worker = null; }
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const req of await cache.keys()) {
        if (cfg.models.some((m) => req.url.includes(`/${m.modelId}/`))) await cache.delete(req);
      }
    } catch (_) { /* yok say */ }
    lsDel(READY_FLAG);
    clearBoot();
    for (const m of cfg.models) await clearPartial(m.modelId);
    setStatus('none', { error: '', progress: { loaded: 0, total: 0 } });
  }

  return pack;
}
