// Dönüştürülen modelleri gerçek Transformers.js ile dener, Tatoeba'dan 200 cümle çevirir.
import { env, pipeline } from '@huggingface/transformers';
import fs from 'node:fs';
env.localModelPath = process.argv[2];
env.allowRemoteModels = false;
const pairs = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).pairs;
// Python değerlendirmesiyle aynı seçim değil; sabit adımlı örneklem
const cand = pairs.filter((p) => { const n = p[0].split(' ').length; return n >= 4 && n <= 12; });
const S = Array.from({ length: 200 }, (_, i) => cand[Math.floor(i * cand.length / 200)]);
const out = {};
for (const [m, dir, extra] of [
  ['Helsinki-NLP/opus-mt-tr-ar', 0, ['Merhaba, havalimanına nasıl gidebilirim?', 'Bu ne kadar?', 'Eczane nerede?']],
  ['Helsinki-NLP/opus-mt-ar-tr', 1, ['كيف يمكنني الذهاب إلى المطار؟', 'بكم هذا؟', 'أين أقرب صيدلية؟']],
]) {
  const t0 = Date.now();
  const t = await pipeline('translation', m, { dtype: 'q8' });
  console.log(m, 'yüklendi', Date.now() - t0, 'ms');
  for (const x of extra) console.log('  ', x, '=>', (await t(x, { max_new_tokens: 200, num_beams: 1 }))[0].translation_text);
  const hyp = [];
  for (const p of S) hyp.push((await t(p[dir], { max_new_tokens: 200, num_beams: 1 }))[0].translation_text);
  out[m] = { hyp, ref: S.map((p) => p[1 - dir]) };
}
fs.writeFileSync('hyp.json', JSON.stringify(out));
