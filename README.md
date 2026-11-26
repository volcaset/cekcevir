# ÇekÇevir — Offline AI Translator

> Şebeke çekmese de, o çevirir.

İnternet yokken bile çalışan, çeviriyi **okunuşuyla birlikte** gösteren karşılıklı konuşma tercümanı.
Tarayıcıdan açılır, "Ana ekrana ekle" ile telefona uygulama gibi kurulur.

## Nasıl çalışır
- Ekranda iki panel var: alttaki sen, üstteki karşındaki kişi (karşılıklı modda üst panel ona dönük durur).
- Sen konuştuğunda/yazdığında kendi panelinde cümlen ve **çevirinin senin alfabende okunuşu** çıkar
  (ör. "Nasılsın?" → *Keyfe hâluk?*).
- 1 saniye sonra karşı panelde çeviri **kendi alfabesiyle ve Latin harfli okunuşuyla** görünür.

## Yol haritası
1. **v0.1 – Temel uygulama (bu sürüm):** PWA, offline açılış, karşılıklı ekran, okunuş motoru, demo ifade sözlüğü, ülkeye göre bayrak ve lehçe (Mısır vb.), gerçek internet göstergesi, "Çeviriyi düzenle".
2. **v0.2 – Offline yapay zeka çevirisi:** NLLB-200 modeli (≈920 MB) parça parça, kaldığı yerden devam ederek indirilir; her cümle internetsiz çevrilir. Tatoeba'dan ~26 bin insan çevirisi cümle ve harekesiz Arapça için okunuş sözlüğü.
3. **v0.3 – Offline mikrofon:** Ses Paketi (OpenAI Whisper small, ≈250 MB, MIT) ile konuşma internetsiz yazıya dökülür; konuşma bitince kayıt kendiliğinden durur.
4. **Supabase ve geliştirmeler:** geçmiş, yeni diller, App Store / Google Play (Capacitor).

## Klasör yapısı
```
www/                 Yayınlanan uygulama (Vercel ve Capacitor bu klasörü kullanır)
  index.html
  sw.js              Offline açılışı sağlayan service worker
  manifest.webmanifest
  css/app.css
  js/app.js          Arayüz ve konuşma akışı
  js/speech.js       Mikrofon ve sesli okuma
  js/engine/         Çeviri ve okunuş motorları
  js/data/           Diller ve demo ifadeler
tests/               Okunuş ve çeviri testleri (npm test)
vercel.json          Vercel ayarları
capacitor.config.json  İleride iOS/Android uygulaması için
```

## Geliştirme
```
npm run dev     # http://localhost:5173
npm test
```

Yayına alırken `www/sw.js` içindeki `VERSION` değerini artırın ki telefonlar yeni sürümü alsın.

## Kaynaklar ve lisanslar
- Çeviri modeli: [Meta NLLB-200 distilled 600M](https://huggingface.co/Xenova/nllb-200-distilled-600M) — **CC BY-NC 4.0 (ticari olmayan kullanım)**. Uygulama ücretli/reklamlı olursa lisansı uygun bir modele geçilmeli.
- Ses tanıma: [OpenAI Whisper small](https://huggingface.co/onnx-community/whisper-small) — MIT.
- Cümle seti: [Tatoeba](https://tatoeba.org) — CC BY 2.0 FR. `scripts/build-tatoeba.mjs` ve GitHub Actions ile üretilir.
- Çalışma motoru: Transformers.js 4.3.2 (Apache-2.0), onnxruntime-web (MIT).
