// Telefon (lite) çeviri paketi: Helsinki-NLP OPUS-MT Türkçe→Arapça ve Arapça→Türkçe.
// Her yön için ayrı küçük model (≈118 MB). Telefonun belleğine rahat sığar.
// Ölçüm (Tatoeba, 200 cümle, chrF): tr→ar 48.8 (NLLB 600M: 49.0), ar→tr 58.7 (NLLB: 55.5).
// Tarayıcıdaki 8-bit sürümle: tr→ar 47.0, ar→tr 55.9.
// Modeller GitHub Actions'ta ONNX'e çevrilip 8-bit küçültüldü ve bu sitede
// 16 MB'lık parçalar halinde duruyor (www/models/).
const FILES = [
  'config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
];
const base = (name) => new URL(`../../models/${name}/`, import.meta.url).href;

export const LITE_TRANSLATION = {
  sizeMB: 240,
  title: 'Helsinki-NLP OPUS-MT, Türkçe↔Arapça (telefon paketi)',
  legal: 'OPUS-MT © Helsinki-NLP (Apache-2.0).',
  models: [
    { modelId: 'cekcevir/opus-mt-tr-ar', base: base('opus-mt-tr-ar'), files: FILES },
    { modelId: 'cekcevir/opus-mt-ar-tr', base: base('opus-mt-ar-tr'), files: FILES },
  ],
  routes: {
    'tr>ar': [{ modelId: 'cekcevir/opus-mt-tr-ar' }],
    'ar>tr': [{ modelId: 'cekcevir/opus-mt-ar-tr' }],
  },
};
