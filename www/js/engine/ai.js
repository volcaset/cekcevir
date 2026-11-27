// ÇekÇevir paketleri: çeviri yapay zekası ve ses tanıma.
// İki profil var:
//  - full (bilgisayar): NLLB-200 600M (≈920 MB) + Whisper small (≈250 MB)
//  - lite (telefon/tablet): küçük Türkçe↔Arapça modelleri + Whisper base (≈80 MB).
//    Telefon tarayıcıları bir sekmeye sınırlı bellek verir; büyük model açılırken sekme çöker.
import { LANGUAGES } from '../data/languages.js';
import { createPack } from './pack.js';
import { LITE_TRANSLATION } from './lite-models.js';
export { storageInfo } from './pack.js';

const ua = navigator.userAgent || '';
export const IS_MOBILE = /iPhone|iPad|iPod|Android/.test(ua)
  || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4);

const PROFILE_KEY = 'cc:profile';
export function getProfile() {
  try { const p = localStorage.getItem(PROFILE_KEY); if (p === 'full' || p === 'lite') return p; } catch (_) { /* yok say */ }
  return IS_MOBILE ? 'lite' : 'full';
}
export function setProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, p); } catch (_) { /* yok say */ }
}
export const PROFILE = getProfile();

const WHISPER_FILES = [
  'config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
];

const AI_FULL = {
  id: 'ai', key: 'ai', task: 'translation', dtype: 'q8', sizeMB: 920, kind: 'nllb',
  title: 'Meta NLLB-200 (tam paket)',
  models: [{ modelId: 'Xenova/nllb-200-distilled-600M', files: [
    'config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ] }],
};
const AI_LITE = { id: 'ai', key: 'ai-lite', task: 'translation', dtype: 'q8', lowMemory: true, kind: 'route', ...LITE_TRANSLATION };

const ASR_FULL = {
  id: 'asr', key: 'asr', task: 'automatic-speech-recognition', dtype: 'q8', sizeMB: 250,
  title: 'OpenAI Whisper small (tam paket)',
  models: [{ modelId: 'onnx-community/whisper-small', files: WHISPER_FILES }],
};
const ASR_LITE = {
  id: 'asr', key: 'asr-lite', task: 'automatic-speech-recognition', dtype: 'q8', sizeMB: 80, lowMemory: true,
  title: 'OpenAI Whisper base (telefon paketi)',
  models: [{ modelId: 'onnx-community/whisper-base', files: WHISPER_FILES }],
};

// v0.2'de indirilenler için eski işaret
try { if (localStorage.getItem('cc:aiInstalled') === '1') { localStorage.setItem('cc:pack:ai', '1'); localStorage.removeItem('cc:aiInstalled'); } } catch (_) { /* yok say */ }

export const ai = createPack(PROFILE === 'lite' ? AI_LITE : AI_FULL);
export const asr = createPack(PROFILE === 'lite' ? ASR_LITE : ASR_FULL);

// translator.js için çeviri motoru
export function createAiEngine(nllbCodeOf) {
  return {
    id: 'ai',
    label: 'Yapay zeka',
    get ready() { return ai.status === 'ready' || ai.status === 'loading' || (ai.status !== 'error' && ai.isInstalled()); },
    async translate(text, from, to) {
      let steps;
      if (ai.kind === 'nllb') {
        steps = [{
          modelId: ai.models[0].modelId,
          src_lang: nllbCodeOf(from) || LANGUAGES[from].nllb,
          tgt_lang: nllbCodeOf(to) || LANGUAGES[to].nllb,
        }];
      } else {
        steps = ai.routes[`${from}>${to}`];
        if (!steps) return null;
      }
      if (ai.status !== 'ready') await ai.install();
      if (ai.status !== 'ready') return null;
      const res = await ai.run({ text, steps });
      return res.text ? { text: res.text, engine: 'ai' } : null;
    },
  };
}

// Ses kaydını (16 kHz Float32Array) yazıya döker
export async function transcribe(audio, langCode) {
  if (asr.status !== 'ready') await asr.install();
  if (asr.status !== 'ready') throw new Error(asr.error || 'Ses paketi hazır değil');
  const language = LANGUAGES[langCode]?.whisper || langCode;
  const r = await asr.run({ audio, language }, [audio.buffer]);
  return r.text;
}
