// ÇekÇevir yapay zeka paketi yöneticisi (ana iş parçacığı tarafı).
// - Paketi indirir, ilerlemeyi bildirir, cihazda kalıcı saklanmasını ister
// - Çeviri motoru olarak translator.js'e kaydolur
import { LANGUAGES } from '../data/languages.js';
import { downloadModel, clearPartial, partialBytes } from './downloader.js';

export const MODEL_ID = 'Xenova/nllb-200-distilled-600M';
export const MODEL_FILES = [
  'config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
];
export const APPROX_SIZE_MB = 920; // model ~895 MB + çalışma motoru ~27 MB
const CACHE_NAME = 'transformers-cache';
const READY_FLAG = 'cc:aiInstalled';

let worker = null;
let seq = 0;
const pending = new Map();
const listeners = new Set();

export const ai = {
  status: 'none', // none | downloading | loading | ready | error
  progress: { loaded: 0, total: 0 },
  error: '',
  threads: 1,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function emit() { for (const fn of listeners) { try { fn(ai); } catch (_) { /* yok say */ } } }
function setStatus(s, extra = {}) { Object.assign(ai, { status: s }, extra); emit(); }

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
  const files = new Map();
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      const p = data.data;
      if (p.file && (p.status === 'progress' || p.status === 'done' || p.status === 'initiate')) {
        const prev = files.get(p.file) || { loaded: 0, total: 0 };
        files.set(p.file, {
          loaded: p.status === 'done' ? (p.total || prev.total || prev.loaded) : (p.loaded ?? prev.loaded),
          total: p.total || prev.total,
        });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded || 0; total += f.total || 0; }
        ai.progress = { loaded, total };
        emit();
      }
      return;
    }
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

function call(msg) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...msg });
  });
}

export function isInstalled() {
  try { return localStorage.getItem(READY_FLAG) === '1'; } catch (_) { return false; }
}

// Önbellekte model dosyaları gerçekten var mı?
export async function verifyCache() {
  try {
    if (!('caches' in self)) return false;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const urls = keys.map((r) => r.url);
    return MODEL_FILES.filter((f) => f.endsWith('.onnx')).every((f) => urls.some((u) => u.includes(`${MODEL_ID}/resolve/main/${f}`)));
  } catch (_) { return false; }
}

export async function storageInfo() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { quota: est?.quota || 0, usage: est?.usage || 0, persisted: !!persisted };
  } catch (_) { return { quota: 0, usage: 0, persisted: false }; }
}

// Paketi indir (veya önbellekten yükle) ve hazır hale getir
let installing = null;
export function install() {
  if (!installing) installing = doInstall().finally(() => { installing = null; });
  return installing;
}
async function doInstall() {
  try { await navigator.storage?.persist?.(); } catch (_) { /* izin verilmeyebilir */ }
  const fromCache = await verifyCache();
  setStatus(fromCache ? 'loading' : 'downloading', { error: '', progress: { loaded: 0, total: 0 } });
  try {
    if (!fromCache) {
      // Parça parça, kaldığı yerden devam eden indirme
      await downloadModel({
        modelId: MODEL_ID, files: MODEL_FILES, cacheName: CACHE_NAME,
        onProgress: (p) => { ai.progress = p; emit(); },
      });
      setStatus('loading', { progress: { loaded: 0, total: 0 } });
    }
    const res = await call({ type: 'load' });
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
export async function warmUp() {
  if (!isInstalled()) return;
  if (!(await verifyCache())) {
    try { localStorage.removeItem(READY_FLAG); } catch (_) { /* yok say */ }
    setStatus('none');
    return;
  }
  install();
}

export async function uninstall() {
  if (worker) { worker.terminate(); worker = null; }
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const req of await cache.keys()) if (req.url.includes(MODEL_ID)) await cache.delete(req);
  } catch (_) { /* yok say */ }
  try { localStorage.removeItem(READY_FLAG); } catch (_) { /* yok say */ }
  await clearPartial();
  setStatus('none', { progress: { loaded: 0, total: 0 } });
}

// Yarım kalmış indirme var mı? (MB olarak)
export async function partialMB() { return Math.round((await partialBytes()) / 1e6); }

// translator.js için motor
export function createAiEngine(regionCodeOf) {
  return {
    id: 'ai',
    label: 'Yapay zeka (NLLB-200)',
    get ready() { return ai.status === 'ready' || ai.status === 'loading' || (ai.status !== 'error' && isInstalled()); },
    async translate(text, from, to) {
      if (ai.status !== 'ready') await install();
      if (ai.status !== 'ready') return null;
      const src = regionCodeOf(from) || LANGUAGES[from].nllb;
      const tgt = regionCodeOf(to) || LANGUAGES[to].nllb;
      const res = await call({ type: 'translate', text, src, tgt });
      return res.text ? { text: res.text, engine: 'ai' } : null;
    },
  };
}
