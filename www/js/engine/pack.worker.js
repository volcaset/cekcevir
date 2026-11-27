// ÇekÇevir yapay zeka işçisi (Web Worker). Her paket (çeviri, ses) kendi
// işçisinde çalışır ki arayüz donmasın. Modeller cihazdaki önbellekten yüklenir.
// Transformers.js 4.3.2 (Apache-2.0); ilk yüklemede service worker cihaza kaydeder.
const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

// iPhone/iPad/Mac Safari 26 öncesi "asyncify" motorunu çalıştıramıyor:
// Transformers.js'in kendi seçimiyle aynı kuralla düz sürümü kullan.
function isOldSafari() {
  const ua = navigator.userAgent || '';
  const apple = (navigator.vendor || '').includes('Apple') || /iPhone|iPad|iPod/.test(ua);
  if (!apple || ua.includes('Android') || /Chrome\//.test(ua)) return false;
  const v = ua.match(/Version\/(\d+)/) || ua.match(/OS (\d+)_/);
  return v ? parseInt(v[1], 10) < 26 : false;
}

let lib = null;
async function getLib() {
  if (lib) return lib;
  let mod;
  try {
    mod = await import(TFJS_URL);
  } catch (err) {
    throw new Error('Yapay zeka kütüphanesi yüklenemedi (' + (err?.message || err) + ')');
  }
  const { env } = mod;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const ortBase = new URL('../../vendor/ort/', import.meta.url).href;
  const variant = isOldSafari() && !('gpu' in navigator) ? '' : '.asyncify';
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${ortBase}ort-wasm-simd-threaded${variant}.mjs`,
    wasm: `${ortBase}ort-wasm-simd-threaded${variant}.wasm`,
  };
  if (self.crossOriginIsolated) {
    env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
  }
  lib = mod;
  return lib;
}

let model = null;
let loading = null;
let task = null;

function load(cfg) {
  if (model) return Promise.resolve(model);
  if (!loading) {
    task = cfg.task;
    loading = getLib().then(({ pipeline }) => pipeline(cfg.task, cfg.modelId, {
      dtype: cfg.dtype || 'q8',
      device: 'wasm',
      progress_callback: (p) => self.postMessage({ type: 'progress', data: {
        status: p.status, file: p.file, loaded: p.loaded, total: p.total,
      } }),
    })).then((m) => { model = m; return m; })
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      await load(data.cfg);
      self.postMessage({ id, type: 'ready', threads: lib.env.backends.onnx.wasm.numThreads || 1 });
    } else if (type === 'run') {
      const m = await load(data.cfg);
      if (task === 'translation') {
        const out = await m(data.text, { src_lang: data.src, tgt_lang: data.tgt, max_new_tokens: 200, num_beams: 1 });
        self.postMessage({ id, type: 'result', text: (out?.[0]?.translation_text || '').trim() });
      } else if (task === 'automatic-speech-recognition') {
        const out = await m(data.audio, { language: data.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
        self.postMessage({ id, type: 'result', text: (out?.text || '').trim() });
      }
    }
  } catch (err) {
    let message = String(err?.message || err);
    if (/memory|allocat|RangeError|out of bounds/i.test(message)) message = 'Cihazın belleği bu model için yetmedi (' + message + ')';
    self.postMessage({ id, type: 'error', message });
  }
};

// Yakalanmayan hataları da ana ekrana bildir
self.addEventListener('error', (e) => self.postMessage({ type: 'fatal', message: e.message || 'bilinmeyen hata' }));
self.addEventListener('unhandledrejection', (e) => self.postMessage({ type: 'fatal', message: String(e.reason?.message || e.reason) }));
