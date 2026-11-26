// Tatoeba'dan Türkçe–Arapça cümle çiftlerini çıkarır -> www/data/tatoeba-tr-ar.json
// Kullanım: node scripts/build-tatoeba.mjs <tur_sentences.tsv> <ara_sentences.tsv> <links.csv>
// Veri: Tatoeba (https://tatoeba.org), CC BY 2.0 FR.
import fs from 'node:fs';
import readline from 'node:readline';

const [turFile, araFile, linksFile] = process.argv.slice(2);
const MAX_LEN = 90;

async function readSentences(file) {
  const map = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const [id, , text] = line.split('\t');
    if (text && text.length <= MAX_LEN) map.set(id, text.trim());
  }
  return map;
}

const tur = await readSentences(turFile);
const ara = await readSentences(araFile);
console.log('tur', tur.size, 'ara', ara.size);

// 1) Doğrudan çeviriler (Türkçe <-> Arapça)
// 2) Ara dil üzerinden (çoğunlukla İngilizce): Türkçe -> X <- Arapça
const direct = [];
const viaTur = new Map(); // pivot id -> [tur ids]
const viaAra = new Map(); // pivot id -> [ara ids]
const rl = readline.createInterface({ input: fs.createReadStream(linksFile), crlfDelay: Infinity });
for await (const line of rl) {
  const [a, b] = line.split('\t');
  if (tur.has(a)) {
    if (ara.has(b)) direct.push([a, b]);
    else (viaTur.get(b) || viaTur.set(b, []).get(b)).push(a);
  } else if (ara.has(a) && !tur.has(b)) {
    (viaAra.get(b) || viaAra.set(b, []).get(b)).push(a);
  }
}
const indirect = [];
for (const [pivot, ts] of viaTur) {
  const as = viaAra.get(pivot);
  if (as) for (const t of ts) indirect.push([t, as[0]]);
}
console.log('direct', direct.length, 'indirect', indirect.length);

const pairs = [];
const seen = new Set();
for (const [a, b] of [...direct, ...indirect]) {
  const tr = tur.get(a);
  const key = tr.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  if (seen.has(key)) continue;
  seen.add(key);
  pairs.push([tr, ara.get(b)]);
}
pairs.sort((x, y) => x[0].length - y[0].length);
const out = {
  source: 'Tatoeba (https://tatoeba.org)',
  license: 'CC BY 2.0 FR',
  generated: new Date().toISOString().slice(0, 10),
  count: pairs.length,
  pairs,
};
fs.mkdirSync('www/data', { recursive: true });
fs.writeFileSync('www/data/tatoeba-tr-ar.json', JSON.stringify(out));
console.log('pairs', pairs.length);
