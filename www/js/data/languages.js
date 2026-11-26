// ÇekÇevir dil tanımları.
// Yeni dil eklemek için bu listeye bir kayıt eklemek yeterli.
// nllb: Adım 2'de kullanılacak NLLB-200 dil kodu.
// whisper: Adım 3'te kullanılacak Whisper dil kodu.
// speech: Tarayıcı ses tanıma / sesli okuma kodu.
export const LANGUAGES = {
  tr: { code: 'tr', name: 'Türkçe', native: 'Türkçe', flag: '🇹🇷', dir: 'ltr', script: 'Latn', nllb: 'tur_Latn', whisper: 'turkish', speech: 'tr-TR' },
  ar: { code: 'ar', name: 'Arapça', native: 'العربية', flag: '🇪🇬', dir: 'rtl', script: 'Arab', nllb: 'arb_Arab', whisper: 'arabic', speech: 'ar-SA' },
};

export const DEFAULT_PAIR = ['tr', 'ar'];
