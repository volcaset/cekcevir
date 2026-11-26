// ÇekÇevir yapay zeka işçisi (Web Worker).
// Çeviri modeli arayüzü dondurmasın diye ayrı bir iş parçacığında çalışır.
// Model ilk indirmede tarayıcının kalıcı önbelleğine (Cache Storage) yazılır;
// sonrasında internet olmadan buradan yüklenir.
// Transformers.js 4.3.2 (Apache-2.0). İlk indirmede service worker tarafından
// cihaza kaydedilir, sonra internetsiz buradan yüklenir.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

const MODEL_ID = 'Xenova/nllb-200-distilled-600M';
const DTYPE = 'q8'; // encoder_model_quantized.onnx + decoder_model_merged_quantized.onnx

env.allowLocalModels = false;
env.useBrowserCache = true;
const ortBase = new URL('../../vendor/ort/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: ortBase + 'ort-wasm-simd-threaded.asyncify.mjs',
  wasm: ortBase + 'ort-wasm-simd-threaded.asyncify.wasm',
};
if (self.crossOriginIsolated) {
  env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
}

let translator = null;
let loading = null;

function load() {
  if (translator) return Promise.resolve(translator);
  if (!loading) {
    loading = pipeline('translation', MODEL_ID, {
      dtype: DTYPE,
      device: 'wasm',
      progress_callback: (p) => self.postMessage({ type: 'progress', data: {
        status: p.status, file: p.file, loaded: p.loaded, total: p.total,
      } }),
    }).then((t) => { translator = t; return t; })
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      await load();
      self.postMessage({ id, type: 'ready', threads: env.backends.onnx.wasm.numThreads || 1 });
    } else if (type === 'translate') {
      const t = await load();
      const out = await t(data.text, { src_lang: data.src, tgt_lang: data.tgt, max_new_tokens: 200, num_beams: 1 });
      self.postMessage({ id, type: 'result', text: (out?.[0]?.translation_text || '').trim() });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
