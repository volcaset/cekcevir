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
  self.postMessage({ type: 'stage', stage: 'kütüphane yüklendi' });
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

// Bir pakette birden çok model olabilir (ör. telefon çevirisi: iki küçük model)
const pipes = new Map();
let task = null;
let lowMemory = false;

function loadModel(modelId, cfg) {
  if (!pipes.has(modelId)) {
    task = cfg.task;
    lowMemory = !!cfg.lowMemory;
    const p = getLib().then(({ pipeline }) => {
      self.postMessage({ type: 'stage', stage: 'model açılıyor: ' + modelId.split('/').pop() });
      return pipeline(cfg.task, modelId, {
        dtype: cfg.dtype || 'q8',
        device: 'wasm',
        // Telefonda bellek tepe noktasını düşür
        ...(lowMemory ? { session_options: { enableCpuMemArena: false, enableMemPattern: false } } : {}),
        progress_callback: (ev) => self.postMessage({ type: 'progress', data: {
          status: ev.status, file: ev.file, loaded: ev.loaded, total: ev.total,
        } }),
      });
    }).catch((err) => { pipes.delete(modelId); throw err; });
    pipes.set(modelId, p);
  }
  return pipes.get(modelId);
}

// Modelleri aynı anda değil sırayla aç: bellek tepe noktası düşük kalsın
async function loadAll(cfg) {
  for (const id of cfg.models) await loadModel(id, cfg);
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      await loadAll(data.cfg);
      self.postMessage({ id, type: 'ready', threads: lib.env.backends.onnx.wasm.numThreads || 1 });
    } else if (type === 'run') {
      if (data.cfg.task === 'translation') {
        // steps: [{ modelId, src_lang?, tgt_lang?, prefix? }] sırayla uygulanır (ara dil üzerinden çeviri)
        let text = data.text;
        for (const step of data.steps) {
          const m = await loadModel(step.modelId, data.cfg);
          const opts = { max_new_tokens: 200, num_beams: 1 };
          if (step.src_lang) Object.assign(opts, { src_lang: step.src_lang, tgt_lang: step.tgt_lang });
          const out = await m((step.prefix ? step.prefix + ' ' : '') + text, opts);
          text = (out?.[0]?.translation_text || out?.[0]?.generated_text || '').trim();
          if (!text) break;
        }
        self.postMessage({ id, type: 'result', text });
      } else if (data.cfg.task === 'automatic-speech-recognition') {
        const m = await loadModel(data.cfg.models[0], data.cfg);
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
