// Ülke / lehçe bilgisi. Bir dil birden fazla ülkede konuşuluyorsa
// bayrak, ses tanıma kodu ve (Adım 2'de) yapay zeka lehçesi buradan seçilir.
// Konum, cihazın saat dilimiyle bulunur: internet ve izin gerektirmez.

export const REGIONS = {
  ar: {
    default: 'EG',
    list: {
      EG: { name: 'Mısır', flag: '🇪🇬', speech: 'ar-EG', nllb: 'arz_Arab', tz: ['Africa/Cairo'] },
      SA: { name: 'Suudi Arabistan', flag: '🇸🇦', speech: 'ar-SA', nllb: 'arb_Arab', tz: ['Asia/Riyadh'] },
      AE: { name: 'BAE', flag: '🇦🇪', speech: 'ar-AE', nllb: 'arb_Arab', tz: ['Asia/Dubai'] },
      QA: { name: 'Katar', flag: '🇶🇦', speech: 'ar-QA', nllb: 'arb_Arab', tz: ['Asia/Qatar'] },
      KW: { name: 'Kuveyt', flag: '🇰🇼', speech: 'ar-KW', nllb: 'arb_Arab', tz: ['Asia/Kuwait'] },
      BH: { name: 'Bahreyn', flag: '🇧🇭', speech: 'ar-BH', nllb: 'arb_Arab', tz: ['Asia/Bahrain'] },
      OM: { name: 'Umman', flag: '🇴🇲', speech: 'ar-OM', nllb: 'arb_Arab', tz: ['Asia/Muscat'] },
      YE: { name: 'Yemen', flag: '🇾🇪', speech: 'ar-YE', nllb: 'arb_Arab', tz: ['Asia/Aden'] },
      IQ: { name: 'Irak', flag: '🇮🇶', speech: 'ar-IQ', nllb: 'acm_Arab', tz: ['Asia/Baghdad'] },
      JO: { name: 'Ürdün', flag: '🇯🇴', speech: 'ar-JO', nllb: 'apc_Arab', tz: ['Asia/Amman'] },
      LB: { name: 'Lübnan', flag: '🇱🇧', speech: 'ar-LB', nllb: 'apc_Arab', tz: ['Asia/Beirut'] },
      SY: { name: 'Suriye', flag: '🇸🇾', speech: 'ar-SY', nllb: 'apc_Arab', tz: ['Asia/Damascus'] },
      PS: { name: 'Filistin', flag: '🇵🇸', speech: 'ar-PS', nllb: 'apc_Arab', tz: ['Asia/Gaza', 'Asia/Hebron'] },
      LY: { name: 'Libya', flag: '🇱🇾', speech: 'ar-LY', nllb: 'arb_Arab', tz: ['Africa/Tripoli'] },
      TN: { name: 'Tunus', flag: '🇹🇳', speech: 'ar-TN', nllb: 'aeb_Arab', tz: ['Africa/Tunis'] },
      DZ: { name: 'Cezayir', flag: '🇩🇿', speech: 'ar-DZ', nllb: 'arb_Arab', tz: ['Africa/Algiers'] },
      MA: { name: 'Fas', flag: '🇲🇦', speech: 'ar-MA', nllb: 'ary_Arab', tz: ['Africa/Casablanca', 'Africa/El_Aaiun'] },
      SD: { name: 'Sudan', flag: '🇸🇩', speech: 'ar-SD', nllb: 'arb_Arab', tz: ['Africa/Khartoum'] },
    },
  },
  tr: {
    default: 'TR',
    list: {
      TR: { name: 'Türkiye', flag: '🇹🇷', speech: 'tr-TR', nllb: 'tur_Latn', tz: ['Europe/Istanbul'] },
    },
  },
};

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; }
}

// Cihazın bulunduğu ülkeye göre dilin bölgesini seç
export function detectRegion(langCode, tz = deviceTimeZone()) {
  const r = REGIONS[langCode];
  if (!r) return null;
  for (const [code, info] of Object.entries(r.list)) if (info.tz.includes(tz)) return code;
  return r.default;
}

export function regionInfo(langCode, regionCode) {
  const r = REGIONS[langCode];
  if (!r) return null;
  return r.list[regionCode] || r.list[r.default];
}
