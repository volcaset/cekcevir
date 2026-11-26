// ÇekÇevir paketleri: çeviri yapay zekası (NLLB-200) ve ses tanıma (Whisper).
import { LANGUAGES } from '../data/languages.js';
import { createPack } from './pack.js';
export { storageInfo } from './pack.js';

// Çeviri: Meta NLLB-200 distilled 600M (CC BY-NC 4.0)
export const ai = createPack({
  id: 'ai',
  modelId: 'Xenova/nllb-200-distilled-600M',
  task: 'translation',
  dtype: 'q8',
  sizeMB: 920,
  files: [
    'config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ],
});
// v0.2'de indirilenler için eski işaret
try { if (localStorage.getItem('cc:aiInstalled') === '1') { localStorage.setItem('cc:pack:ai', '1'); localStorage.removeItem('cc:aiInstalled'); } } catch (_) { /* yok say */ }

// Ses tanıma: OpenAI Whisper small (MIT)
export const asr = createPack({
  id: 'asr',
  modelId: 'onnx-community/whisper-small',
  task: 'automatic-speech-recognition',
  dtype: 'q8',
  sizeMB: 250,
  files: [
    'config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ],
});

// translator.js için çeviri motoru
export function createAiEngine(nllbCodeOf) {
  return {
    id: 'ai',
    label: 'Yapay zeka (NLLB-200)',
    get ready() { return ai.status === 'ready' || ai.status === 'loading' || (ai.status !== 'error' && ai.isInstalled()); },
    async translate(text, from, to) {
      if (ai.status !== 'ready') await ai.install();
      if (ai.status !== 'ready') return null;
      const src = nllbCodeOf(from) || LANGUAGES[from].nllb;
      const tgt = nllbCodeOf(to) || LANGUAGES[to].nllb;
      const res = await ai.run({ text, src, tgt });
      return res.text ? { text: res.text, engine: 'ai' } : null;
    },
  };
}

// Ses kaydını (16 kHz Float32Array) yazıya döker
export async function transcribe(audio, langCode) {
  if (asr.status !== 'ready') await asr.install();
  if (asr.status !== 'ready') throw new Error(asr.error || 'Ses paketi hazır değil');
  const language = LANGUAGES[langCode]?.whisper || langCode;
  return new Promise((resolve, reject) => {
    asr.call({ type: 'run', cfg: { modelId: asr.modelId, task: asr.task, dtype: asr.dtype }, audio, language }, [audio.buffer])
      .then((r) => resolve(r.text)).catch(reject);
  });
}
