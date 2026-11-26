// ÇekÇevir okunuş motoru.
// Bir dilde yazılmış metni, başka bir dili okuyan birinin seslendirebileceği
// şekilde yazar. Kural tabanlıdır, internet ve model gerektirmez.
//
//   arabicToTurkish('كَيْفَ حَالُكَ؟')  -> 'keyfe hâluk?'
//   turkishToArabic('Nasılsın?')        -> 'نَاسِلْسِنْ؟' benzeri
//
// Not: Arapça metin harekeli (sesli işaretli) olduğunda sonuç en doğrudur.
// Adım 2'de model çıktısına hareke ekleyen bir katman gelecek.

import { AR_LEXICON } from '../data/ar-lexicon.js';

// ---------- Arapça -> Türkçe okunuş ----------

const FATHA = 'َ', DAMMA = 'ُ', KASRA = 'ِ', SUKUN = 'ْ', SHADDA = 'ّ';
const TAN_FATH = 'ً', TAN_DAMM = 'ٌ', TAN_KASR = 'ٍ', DAGGER_ALEF = 'ٰ';
const HARAKAT = new Set([FATHA, DAMMA, KASRA, SUKUN, SHADDA, TAN_FATH, TAN_DAMM, TAN_KASR, DAGGER_ALEF, 'ـ']);

const AR_CONS = {
  'ب': 'b', 'ت': 't', 'ث': 's', 'ج': 'c', 'ح': 'h', 'خ': 'h', 'د': 'd', 'ذ': 'z',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'ş', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
  'ع': "'", 'غ': 'g', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'v', 'ي': 'y', 'ء': "'", 'أ': "'", 'إ': "'", 'ؤ': "'", 'ئ': "'",
  'پ': 'p', 'چ': 'ç', 'گ': 'g', 'ژ': 'j', 'ڤ': 'v',
};
// Kalın (ince "e" yerine "a" ile okunan) harfler
const THICK = new Set(['ص', 'ض', 'ط', 'ظ', 'ق', 'غ', 'خ', 'ح', 'ع', 'ر']);
const SUN = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']);
const HAMZA_SEATS = new Set(['أ', 'إ', 'ؤ', 'ئ', 'ء']);
const AR_PUNCT = { '؟': '?', '،': ',', '؛': ';', '٪': '%' };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function isArabicLetter(ch) { return /[ء-يٱ-ۓ]/.test(ch); }

// Bir harften sonra gelen hareke işaretlerini topla
function readMarks(chars, i) {
  const marks = [];
  let j = i + 1;
  while (j < chars.length && HARAKAT.has(chars[j])) { marks.push(chars[j]); j++; }
  return { marks, next: j };
}

function fathaVowel(letter) { return THICK.has(letter) || letter === 'ا' || HAMZA_SEATS.has(letter) ? 'a' : 'e'; }

function transliterateArabicWord(word, isLastInPhrase) {
  const chars = [...word];
  let out = '';
  let i = 0;
  let wordStart = true;
  let skipShadda = false;

  // "ال" takısı
  const bare = chars.filter((c) => !HARAKAT.has(c));
  if (bare.length > 2 && (bare[0] === 'ا' || bare[0] === 'ٱ') && bare[1] === 'ل') {
    // ال harflerini atla
    let k = 0, seen = 0;
    while (k < chars.length && seen < 2) { if (!HARAKAT.has(chars[k])) seen++; k++; }
    while (k < chars.length && HARAKAT.has(chars[k])) k++;
    const nextLetter = chars[k];
    if (SUN.has(nextLetter) && nextLetter !== 'ل') {
      out += 'e' + (AR_CONS[nextLetter] || '') + '-';
      skipShadda = true;
    } else {
      out += 'el-';
    }
    i = k;
    wordStart = false;
  }

  let lastLetter = '';
  let lastVowel = ''; // son yazılan kısa ünlü
  const bareWord = ![...word].some((c) => HARAKAT.has(c));
  const end = chars.length;

  while (i < end) {
    const ch = chars[i];
    if (!isArabicLetter(ch)) { out += ch; i++; continue; }
    const { marks, next } = readMarks(chars, i);
    const has = (m) => marks.includes(m);
    const nextCh = chars[next];

    // Uzun ünlü harfleri: ا ى و ي (öncesindeki harekeye göre)
    if ((ch === 'ا' || ch === 'ى') && !wordStart && marks.length === 0) {
      if (lastVowel === 'a' || lastVowel === 'e' || lastVowel === '') { out = out.replace(/[ae]$/, '') + 'â'; lastVowel = 'â'; }
      i = next; continue;
    }
    if (ch === 'ا' && !wordStart && marks.length === 0) { i = next; continue; }
    if (ch === 'و' && lastVowel === 'u' && marks.length === 0) { out = out.replace(/u$/, '') + 'û'; lastVowel = 'û'; i = next; continue; }
    if (ch === 'ي' && lastVowel === 'i' && marks.length === 0) { out = out.replace(/i$/, '') + 'î'; lastVowel = 'î'; i = next; continue; }

    // Kelime başı elif / hemze: sessiz, sadece ünlüsü okunur
    let cons;
    if (ch === 'آ') { out += wordStart ? 'â' : "'â"; lastVowel = 'â'; lastLetter = ch; wordStart = false; i = next; continue; }
    if ((ch === 'ا' || ch === 'ٱ' || HAMZA_SEATS.has(ch) || ch === 'ع') && wordStart) cons = '';
    else if (ch === 'ة') cons = null; // aşağıda
    else cons = AR_CONS[ch] ?? '';

    if (ch === 'ة') {
      // Duraklamada "e/a", devamında "t" + ünlü
      const vowelMark = marks.find((m) => [FATHA, DAMMA, KASRA, TAN_FATH, TAN_DAMM, TAN_KASR].includes(m));
      if (!vowelMark || isLastInPhrase) {
        if (!/[ae]$/.test(out)) out += THICK.has(lastLetter) ? 'a' : 'e';
        lastVowel = 'e';
      }
      else { out += 't' + vowelFor(vowelMark, ch); lastVowel = 'x'; }
      i = next; wordStart = false; lastLetter = ch; continue;
    }

    if (has(SHADDA) && !skipShadda) cons = cons + cons;
    skipShadda = false;
    out += cons;

    // Ünlü
    let v = '';
    if (has(FATHA)) v = fathaVowel(ch);
    else if (has(KASRA)) v = 'i';
    else if (has(DAMMA)) v = 'u';
    else if (has(TAN_FATH)) v = fathaVowel(ch) + 'n';
    else if (has(TAN_KASR)) v = 'in';
    else if (has(TAN_DAMM)) v = 'un';
    else if (has(DAGGER_ALEF)) v = 'â';
    else if (!has(SUKUN)) {
      // Harekesiz metin: tahmin
      if (wordStart && ch === 'ا') v = 'i';
      else if (wordStart && ch === 'أ') v = 'e';
      else if (wordStart && ch === 'إ') v = 'i';
      else if (ch === 'ي' && cons === 'y' && !wordStart && !/[aeiouâîû]$/.test(out.slice(0, -1)) ) { out = out.slice(0, -1) + 'i'; lastVowel = 'i'; }
      else if (ch === 'و' && !wordStart && !/[aeiouâîû]$/.test(out.slice(0, -1))) { out = out.slice(0, -1) + 'u'; lastVowel = 'u'; }
      else if (bareWord && cons && !/['ʼ]/.test(cons)) {
        // Tamamen harekesiz kelime: hece tahmini. Uzun ünlü harfinden ya da
        // kelime sonundan önce ünlü ekleme; ardışık ünsüzlerde bir ekle bir atla.
        const nxt = chars.slice(next).find((c) => !HARAKAT.has(c));
        const nextIsVowelLetter = !nxt || ['ا', 'ى', 'و', 'ي', 'ة', 'آ'].includes(nxt) || !isArabicLetter(nxt);
        const before = out.slice(0, out.length - cons.length);
        const prevGotVowel = /[aeiouâîû]$/.test(before);
        if (!nextIsVowelLetter && !prevGotVowel) v = fathaVowel(ch);
      }
    }
    if (has(DAGGER_ALEF) && v !== 'â') v += 'â';
    out += v;
    if (v) lastVowel = v.endsWith('n') && v.length > 1 ? 'x' : v.slice(-1);
    else if (has(SUKUN)) lastVowel = 'x';
    lastLetter = ch;
    wordStart = false;
    i = next;
  }

  // Tenvin-i fetha sonrası gelen elif zaten atlandı. Duraklamada son kısa ünlü düşer.
  if (isLastInPhrase && bare[bare.length - 1] !== 'ة') {
    out = out.replace(/([^aeiâîû'])(un|in)$/, '$1').replace(/([^aeiouâîû'])[eiu]$/, '$1');
  }
  return out;
}

function vowelFor(mark, letter) {
  if (mark === FATHA) return fathaVowel(letter);
  if (mark === KASRA) return 'i';
  if (mark === DAMMA) return 'u';
  if (mark === TAN_FATH) return 'an';
  if (mark === TAN_KASR) return 'in';
  if (mark === TAN_DAMM) return 'un';
  return '';
}

// Harekesiz kelime -> harekeli hali (sözlükten)
const stripMarks = (w) => w.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
const loose = (w) => stripMarks(w).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const LEX = new Map();
for (const w of AR_LEXICON) {
  for (const k of [stripMarks(w), loose(w)]) if (!LEX.has(k)) LEX.set(k, w);
}
const SUN_LETTERS = 'تثدذرزسشصضطظلن';
function lexLookup(bare) {
  return LEX.get(bare) || LEX.get(loose(bare)) || null;
}
// Ön ekleri (و ف ب ل ك + ال) ayırıp sözlükte arar
export function vocalizeWord(word) {
  if (/[\u064B-\u0652]/.test(word)) {
    // Zaten harekeli: sadece "وَالْ / بِالْ / لِلْ" gibi ön ekleri ayır
    const m = word.match(/^([وفبك][\u064B-\u0652]*)(ال.+)$/);
    if (m && m[2].replace(/[\u064B-\u0652]/g, '').length > 3) return m[1] + ' ' + m[2];
    return word;
  }
  const direct = lexLookup(word);
  if (direct) return direct;
  const prefixes = [['وال', 'وَالْ'], ['فال', 'فَالْ'], ['بال', 'بِالْ'], ['كال', 'كَالْ'], ['لل', 'لِالْ'], ['ال', 'الْ'], ['و', 'وَ'], ['ف', 'فَ'], ['ب', 'بِ'], ['ل', 'لِ']];
  for (const [p, pv] of prefixes) {
    if (word.length > p.length + 1 && word.startsWith(p)) {
      const rest = lexLookup(word.slice(p.length));
      if (rest) {
        const isArticle = pv.endsWith('الْ') || p === 'لل';
        if (isArticle) {
          // Ön ek + "ال" iki parça gibi okunur: "vel-..." -> "ve'l-...", güneş harfleri dahil
          const head = pv.slice(0, -3) || '';
          const art = 'الْ' + rest;
          return head ? head + ' ' + art : art;
        }
        return pv + rest;
      }
    }
  }
  return word;
}

export function arabicToTurkish(text) {
  if (!text) return '';
  let s = text.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[؟،؛٪]/g, (p) => AR_PUNCT[p]);
  // Kelimelere ayır, noktalama işaretlerini koru
  const tokens = s.split(/(\s+|[?!.,;:])/).filter((t) => t !== '');
  const out = tokens.map((tok, idx) => {
    if (!/[؀-ۿ]/.test(tok)) return tok;
    // Cümle sonunda mı? (sonrasında sadece boşluk/noktalama varsa)
    const rest = tokens.slice(idx + 1).join('');
    const last = !/[؀-ۿ]/.test(rest.split(/[?!.,;:]/)[0] || '');
    const parts = vocalizeWord(tok).split(' ');
    return parts.map((pt, k) => transliterateArabicWord(pt, last && k === parts.length - 1)).join(' ');
  });
  // "sabâhu el-hayr" -> "sabâhu'l-hayr" (önceki kelime ünlüyle bitiyorsa)
  let res = out.join('').replace(/\s+/g, ' ').trim();
  res = res.replace(/([aeiouâîû]) e([a-zçşğ]+)-/g, "$1'$2-");
  res = res.replace(/(^|[\s-])'/g, '$1'); // kelime başı ayın/hemze işaretini sil
  return res.charAt(0).toLocaleUpperCase('tr') + res.slice(1);
}

// ---------- Türkçe -> Arap harfli okunuş ----------

const TR_CONS = {
  b: 'ب', c: 'ج', ç: 'تش', d: 'د', f: 'ف', g: 'غ', h: 'ه', j: 'ج', k: 'ك', l: 'ل',
  m: 'م', n: 'ن', p: 'ب', r: 'ر', s: 'س', ş: 'ش', t: 'ت', v: 'ف', y: 'ي', z: 'ز',
  q: 'ك', w: 'و', x: 'كس',
};
const TR_VOWEL_MID = { a: 'ا', e: 'ي', ı: 'ِ', i: 'ي', o: 'و', ö: 'و', u: 'و', ü: 'و', â: 'ا', î: 'ي', û: 'و' };
const TR_VOWEL_START = { a: 'آ', e: 'إي', ı: 'إ', i: 'إي', o: 'أو', ö: 'أو', u: 'أو', ü: 'أو', â: 'آ', î: 'إي', û: 'أو' };
const TR_PUNCT = { '?': '؟', ',': '،', ';': '؛' };

function transliterateTurkishWord(word) {
  const w = word.toLocaleLowerCase('tr');
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const prev = w[i - 1];
    if (ch === 'ğ') continue; // yumuşak g: önceki ünlüyü uzatır, yazılmaz
    if (TR_VOWEL_MID[ch]) {
      const nearY = w[i + 1] === 'y' || prev === 'y';
      if ((ch === 'i' || ch === 'e') && nearY) out += i === 0 ? 'إِ' : 'ِ';
      else out += i === 0 ? TR_VOWEL_START[ch] : TR_VOWEL_MID[ch];
      continue;
    }
    if (TR_CONS[ch]) {
      if (ch === prev) { out += 'ّ'; continue; } // çift ünsüz -> şedde
      out += TR_CONS[ch];
      continue;
    }
    out += TR_PUNCT[ch] ?? ch;
  }
  return out;
}

export function turkishToArabic(text) {
  if (!text) return '';
  return text.split(/(\s+)/).map((t) => (/\s/.test(t) ? t : transliterateTurkishWord(t))).join('');
}

// ---------- Genel arayüz ----------

// text: okunuşu yazılacak metin, textLang: metnin dili, readerLang: okuyacak kişinin dili
export function readingFor(text, textLang, readerLang) {
  if (!text || textLang === readerLang) return '';
  if (textLang === 'ar' && readerLang === 'tr') return arabicToTurkish(text);
  if (textLang === 'tr' && readerLang === 'ar') return turkishToArabic(text);
  if (textLang === 'ar') return arabicToTurkish(text); // varsayılan: Latin harfli okunuş
  return '';
}

// Bir metnin Latin harfli hali (Latin olmayan alfabeler için)
export function latinize(text, lang) {
  if (lang === 'ar') return arabicToTurkish(text);
  return '';
}
