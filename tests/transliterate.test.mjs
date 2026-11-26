import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arabicToTurkish, turkishToArabic } from '../www/js/engine/transliterate.js';
import { translate } from '../www/js/engine/translator.js';

test('Arapça -> Türkçe okunuş', () => {
  assert.equal(arabicToTurkish('كَيْفَ حَالُكَ؟'), 'Keyfe hâluk?');
  assert.equal(arabicToTurkish('شُكْرًا'), 'Şukran');
  assert.equal(arabicToTurkish('صَبَاحُ الْخَيْرِ'), "Sabâhu'l-hayr");
  assert.equal(arabicToTurkish('مَعَ السَّلَامَةِ'), "Me'a's-selâme");
  assert.equal(arabicToTurkish('أَيْنَ الْحَمَّامُ؟'), "Ayne'l-hammâm?");
});

test('Türkçe -> Arap harfli okunuş', () => {
  assert.equal(turkishToArabic('Nasılsın?'), 'ناسِلسِن؟');
  assert.equal(turkishToArabic('merhaba'), 'ميرهابا');
});

test('Demo sözlük iki yönde çalışır', async () => {
  assert.equal((await translate('nasılsın', 'tr', 'ar')).text, 'كَيْفَ حَالُكَ؟');
  assert.equal((await translate('كيف حالك', 'ar', 'tr')).text, 'Nasılsın?');
  assert.equal(await translate('bilinmeyen uzun bir cümle', 'tr', 'ar'), null);
});

import { detectRegion } from '../www/js/data/regions.js';
test('Konuma göre Arapça bölgesi', () => {
  assert.equal(detectRegion('ar', 'Africa/Cairo'), 'EG');
  assert.equal(detectRegion('ar', 'Asia/Riyadh'), 'SA');
  assert.equal(detectRegion('ar', 'Europe/Istanbul'), 'EG'); // bilinmeyen yer: varsayılan Mısır
});

test('Mısır lehçesi seçiliyse Mısır Arapçası', async () => {
  const r = await translate('Nasılsın?', 'tr', 'ar', { regions: { ar: 'EG' } });
  assert.equal(r.text, 'إِزَّيَّكْ؟');
  assert.equal((await translate('ازيك', 'ar', 'tr')).text, 'Nasılsın?');
  assert.equal((await translate('Nasılsın?', 'tr', 'ar', { regions: { ar: 'SA' } })).text, 'كَيْفَ حَالُكَ؟');
});

test('Harekesiz Arapça (yapay zeka çıktısı) sözlükle doğru okunur', () => {
  assert.equal(arabicToTurkish('شكرا'), 'Şukran');
  assert.equal(arabicToTurkish('كيف حالك'), 'Keyfe hâluk');
  assert.equal(arabicToTurkish('والشاي'), "Ve'ş-şây");
  assert.equal(arabicToTurkish('أين المطار'), "Ayne'l-metâr");
});
