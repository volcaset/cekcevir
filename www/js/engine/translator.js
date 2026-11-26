// ÇekÇevir çeviri katmanı.
// Uygulamanın geri kalanı sadece translate() fonksiyonunu bilir.
// Adım 1: demo ifade sözlüğü (offline).
// Adım 2: NLLB-200 yapay zeka modeli (offline, tarayıcı içinde) buraya eklenecek;
//         sözlük, model indirilmemişken yedek olarak kalacak.
import { PHRASES } from '../data/phrases.js';

const AR_DIACRITICS = /[ً-ٰٟـ]/g;

export function normalize(text, lang) {
  let s = (text || '').trim();
  if (lang === 'ar') {
    s = s.replace(AR_DIACRITICS, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');
  } else {
    s = s.toLocaleLowerCase(lang === 'tr' ? 'tr' : undefined);
  }
  return s.replace(/[?!.,;:؟،؛"'()]/g, '').replace(/\s+/g, ' ').trim();
}

const engines = [];

// Demo sözlük motoru
const phrasebook = {
  id: 'phrasebook',
  label: 'Demo sözlük',
  ready: true,
  async translate(text, from, to, opts = {}) {
    const key = normalize(text, from);
    if (!key) return null;
    const keysOf = (p) => [from, ...Object.keys(p).filter((k) => k.startsWith(from + '_'))];
    const hit = PHRASES.find((p) => keysOf(p).some((k) => normalize(p[k], from) === key));
    if (!hit) return null;
    const region = opts.regions?.[to];
    const out = (region && hit[`${to}_${region}`]) || hit[to];
    return out ? { text: out, engine: this.id } : null;
  },
};
engines.push(phrasebook);

export function registerEngine(engine, { priority = false } = {}) {
  if (priority) engines.unshift(engine); else engines.push(engine);
}

export function activeEngines() { return engines.filter((e) => e.ready); }

// Sırayla hazır motorları dener, ilk sonucu döner.
// opts.regions: { ar: 'EG' } gibi; lehçeye göre çeviri seçmek için
export async function translate(text, from, to, opts = {}) {
  for (const engine of activeEngines()) {
    try {
      const res = await engine.translate(text, from, to, opts);
      if (res && res.text) return res;
    } catch (err) {
      console.warn('[ÇekÇevir] motor hatası', engine.id, err);
    }
  }
  return null;
}

export function examplePhrases(lang, region) {
  return PHRASES.map((p) => (region && p[`${lang}_${region}`]) || p[lang]).filter(Boolean);
}
