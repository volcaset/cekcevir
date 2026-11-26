// ÇekÇevir ana uygulama
import { LANGUAGES, DEFAULT_PAIR } from './data/languages.js';
import { REGIONS, detectRegion, regionInfo } from './data/regions.js';
import { translate, examplePhrases, registerEngine } from './engine/translator.js';
import { correctionsEngine, saveCorrection } from './engine/corrections.js';

registerEngine(correctionsEngine, { priority: true });
import { readingFor } from './engine/transliterate.js';
import { canListen, listen, stopListening, canSpeak, speak } from './speech.js';

const APP_VERSION = '0.1.2';
const DELIVERY_DELAY_MS = 1000; // karşı tarafa aktarım gecikmesi

// ---------- Ayarlar (cihazda saklanır) ----------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('cc:' + key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
  set(key, value) { try { localStorage.setItem('cc:' + key, JSON.stringify(value)); } catch (_) { /* yok say */ } },
};

const state = {
  // a: alttaki (telefonu tutan) kişi, b: üstteki (karşıdaki) kişi
  langs: { a: store.get('langA', DEFAULT_PAIR[0]), b: store.get('langB', DEFAULT_PAIR[1]) },
  faceToFace: store.get('faceToFace', true),
  // Ülke/lehçe: kullanıcı elle seçmediyse cihazın konumuna (saat dilimi) göre otomatik
  regions: store.get('regions', {}),
  listeningSide: null,
};
if (!LANGUAGES[state.langs.a]) state.langs.a = DEFAULT_PAIR[0];
if (!LANGUAGES[state.langs.b]) state.langs.b = DEFAULT_PAIR[1];

function regionOf(langCode) {
  return state.regions[langCode] || detectRegion(langCode);
}
function flagOf(langCode) {
  return regionInfo(langCode, regionOf(langCode))?.flag || LANGUAGES[langCode].flag;
}
function speechCode(langCode) {
  return regionInfo(langCode, regionOf(langCode))?.speech || LANGUAGES[langCode].speech;
}

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const other = (side) => (side === 'a' ? 'b' : 'a');
const panes = { a: $('#pane-a'), b: $('#pane-b') };

// ---------- Panelleri kur ----------
function buildPane(side) {
  const pane = panes[side];
  pane.innerHTML = '';
  const head = el('div', 'pane-head');
  const select = el('select', 'lang-select');
  select.setAttribute('aria-label', 'Dil seç');
  for (const lang of Object.values(LANGUAGES)) {
    const opt = el('option', null, `${flagOf(lang.code)} ${lang.native}`);
    opt.value = lang.code;
    select.append(opt);
  }
  select.value = state.langs[side];
  select.addEventListener('change', () => setLang(side, select.value));

  const phraseBtn = el('button', 'icon-btn', '💬');
  phraseBtn.title = 'Örnek cümleler';
  phraseBtn.setAttribute('aria-label', 'Örnek cümleler');
  phraseBtn.addEventListener('click', () => openPhrases(side));
  const left = el('div', 'head-left');
  left.append(select);
  const regions = REGIONS[state.langs[side]];
  if (regions && Object.keys(regions.list).length > 1) {
    const rsel = el('select', 'region-select');
    rsel.setAttribute('aria-label', 'Ülke / lehçe');
    rsel.title = 'Ülke / lehçe (konumuna göre otomatik seçildi)';
    for (const [code, info] of Object.entries(regions.list)) {
      const o = el('option', null, `${info.flag} ${info.name}`);
      o.value = code;
      rsel.append(o);
    }
    rsel.value = regionOf(state.langs[side]);
    rsel.addEventListener('change', () => {
      state.regions[state.langs[side]] = rsel.value;
      store.set('regions', state.regions);
      buildPane('a'); buildPane('b');
    });
    left.append(rsel);
  }
  head.append(left, phraseBtn);

  const feed = el('div', 'feed');
  feed.setAttribute('aria-live', 'polite');
  const hint = el('p', 'feed-hint');
  hint.textContent = hintText(side);
  feed.append(hint);

  const form = el('form', 'composer');
  const input = el('textarea', 'composer-input');
  input.rows = 1;
  input.placeholder = placeholderText(side);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', () => autoGrow(input));
  const mic = el('button', 'mic-btn');
  mic.type = 'button';
  mic.setAttribute('aria-label', 'Konuş');
  mic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>';
  mic.addEventListener('click', () => toggleMic(side));
  const send = el('button', 'send-btn');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Çevir');
  send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5v6.6l12 1.9-12 1.9v6.6Z"/></svg>';
  form.append(input, mic, send);
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { input.value = ''; autoGrow(input); handleUtterance(side, t); } });

  pane.append(head, feed, form);
  applyLangAttrs(side);
}

function hintText(side) {
  const l = LANGUAGES[state.langs[side]];
  return l.code === 'ar' ? 'اضغط على الميكروفون وتكلّم، أو اكتب هنا' : `${l.name} konuşmak için mikrofona dokun veya yaz`;
}
function placeholderText(side) {
  return LANGUAGES[state.langs[side]].code === 'ar' ? 'اكتب هنا…' : 'Buraya yaz…';
}
function applyLangAttrs(side) {
  const l = LANGUAGES[state.langs[side]];
  const pane = panes[side];
  pane.dataset.lang = l.code;
  const input = $('.composer-input', pane);
  input.dir = l.dir; input.lang = l.code;
}
function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }

function setLang(side, code) {
  if (code === state.langs[other(side)]) state.langs[other(side)] = state.langs[side]; // aynı dil seçilirse yer değiştir
  state.langs[side] = code;
  store.set('langA', state.langs.a); store.set('langB', state.langs.b);
  buildPane('a'); buildPane('b');
}

function swapLangs() {
  [state.langs.a, state.langs.b] = [state.langs.b, state.langs.a];
  store.set('langA', state.langs.a); store.set('langB', state.langs.b);
  buildPane('a'); buildPane('b');
}

// ---------- Konuşma akışı ----------
async function handleUtterance(side, text) {
  const from = state.langs[side];
  const to = state.langs[other(side)];
  const res = await translate(text, from, to, { regions: { [from]: regionOf(from), [to]: regionOf(to) } });
  const speakerFeed = $('.feed', panes[side]);
  const listenerFeed = $('.feed', panes[other(side)]);
  clearHint(speakerFeed);

  if (!res) {
    addBubble(speakerFeed, buildMissBubble(text, from));
    return;
  }

  // 1) Konuşanın ekranı: kendi cümlesi + çevirinin kendi alfabesindeki okunuşu
  const said = addBubble(speakerFeed, buildSaidBubble(text, from, res.text, to, res.engine));

  // 2) 1 sn sonra karşı tarafın ekranı: orijinal alfabe + Latin okunuş
  clearHint(listenerFeed);
  const pending = addBubble(listenerFeed, buildPendingBubble());
  setTimeout(() => {
    const heard = buildHeardBubble(res.text, to, res.source || text, from);
    pending.replaceWith(heard);
    said._heard = heard;
    listenerFeed.scrollTop = listenerFeed.scrollHeight;
  }, DELIVERY_DELAY_MS);
}

function clearHint(feed) { const h = $('.feed-hint', feed); if (h) h.remove(); }
function addBubble(feed, node) { feed.append(node); feed.scrollTop = feed.scrollHeight; return node; }

function speakBtn(text, langCode, label) {
  const b = el('button', 'speak-btn', '🔊');
  b.type = 'button';
  b.title = label; b.setAttribute('aria-label', label);
  if (!canSpeak()) b.hidden = true;
  b.addEventListener('click', () => speak(text, speechCode(langCode)));
  return b;
}

function textLine(cls, text, langCode) {
  const p = el('p', cls, text);
  const l = LANGUAGES[langCode];
  p.lang = l.code; p.dir = l.dir;
  return p;
}

function buildSaidBubble(original, fromLang, translated, toLang, engine) {
  const b = el('div', 'bubble said');
  b.append(textLine('b-main', original, fromLang));
  b._ctx = { original, fromLang, toLang };
  const reading = readingFor(translated, toLang, fromLang);
  const box = el('div', 'b-reading');
  const label = el('span', 'b-label', fromLang === 'ar' ? 'كيف تنطقها:' : `${LANGUAGES[toLang].name} okunuşu:`);
  const row = el('div', 'b-row');
  row.append(textLine('b-read', reading || translated, fromLang), speakBtn(translated, toLang, 'Çeviriyi dinle'));
  box.append(label, row);
  if (reading) box.append(textLine('b-script', translated, toLang));
  b.append(box);
  const foot = el('div', 'b-foot');
  if (engine === 'user') foot.append(el('span', 'b-badge', fromLang === 'ar' ? '✓ تصحيحك' : '✓ Senin düzeltmen'));
  const edit = el('button', 'edit-btn', fromLang === 'ar' ? '✏️ تعديل الترجمة' : '✏️ Çeviriyi düzenle');
  edit.type = 'button';
  edit.addEventListener('click', () => openEditor(b, translated));
  foot.append(edit);
  b.append(foot);
  return b;
}

// ---------- Çeviriyi düzenle ----------
const editor = $('#edit-sheet');
let editing = null;
function openEditor(bubble, current) {
  editing = bubble;
  const { original, fromLang, toLang } = bubble._ctx;
  $('.edit-source', editor).textContent = original;
  $('.edit-source', editor).lang = fromLang; $('.edit-source', editor).dir = LANGUAGES[fromLang].dir;
  const ta = $('.edit-input', editor);
  ta.value = current; ta.lang = toLang; ta.dir = LANGUAGES[toLang].dir;
  $('.edit-lang', editor).textContent = `${flagOf(toLang)} ${LANGUAGES[toLang].name} çevirisi:`;
  editor.classList.toggle('flipped', bubble.closest('#pane-b') && state.faceToFace && !isWide());
  editor.showModal();
  ta.focus();
}
$('.sheet-close', editor).addEventListener('click', () => editor.close());
$('.edit-form', editor).addEventListener('submit', (e) => {
  e.preventDefault();
  if (!editing) return;
  const fixed = $('.edit-input', editor).value.trim();
  if (!fixed) return;
  const { original, fromLang, toLang } = editing._ctx;
  saveCorrection(original, fromLang, toLang, fixed);
  const fresh = buildSaidBubble(original, fromLang, fixed, toLang, 'user');
  if (editing._heard) {
    const heard = buildHeardBubble(fixed, toLang, original, fromLang);
    editing._heard.replaceWith(heard);
    fresh._heard = heard;
  }
  editing.replaceWith(fresh);
  editing = null;
  editor.close();
  toast('Düzeltme kaydedildi. Bu cümle artık hep böyle çevrilecek.');
});

// Karşı tarafın ekranı: çeviri kendi dilinde + konuşanın asıl cümlesinin
// karşı tarafın alfabesiyle okunuşu (o da konuşanın dilini öğrensin).
function buildHeardBubble(translated, toLang, original, fromLang) {
  const b = el('div', 'bubble heard');
  b.append(textLine('b-main', translated, toLang));
  if (original) {
    const reading = readingFor(original, fromLang, toLang);
    const box = el('div', 'b-reading');
    const label = el('span', 'b-label', toLang === 'ar' ? `كيف تُنطق بال${fromLang === 'tr' ? 'تركية' : LANGUAGES[fromLang].native}:` : `${LANGUAGES[fromLang].name} okunuşu:`);
    label.dir = LANGUAGES[toLang].dir;
    const row = el('div', 'b-row');
    row.append(textLine('b-read', reading || original, toLang), speakBtn(original, fromLang, 'Aslını dinle'));
    box.append(label, row);
    if (reading) box.append(textLine('b-script', original, fromLang));
    b.append(box);
  }
  return b;
}

function buildPendingBubble() {
  const b = el('div', 'bubble heard pending');
  b.append(el('span', 'dot'), el('span', 'dot'), el('span', 'dot'));
  b.setAttribute('aria-label', 'Çevriliyor');
  return b;
}

function buildMissBubble(text, lang) {
  const b = el('div', 'bubble said miss');
  b.append(textLine('b-main', text, lang));
  const note = lang === 'ar'
    ? 'هذه الجملة غير موجودة في القاموس التجريبي. ستأتي الترجمة بالذكاء الاصطناعي في التحديث القادم.'
    : 'Bu cümle demo sözlükte yok. Her cümleyi çeviren offline yapay zeka paketi bir sonraki güncellemede geliyor. Şimdilik 💬 ile örnek cümleleri deneyebilirsin.';
  b.append(textLine('b-note', note, lang));
  return b;
}

// ---------- Mikrofon ----------
function toggleMic(side) {
  const pane = panes[side];
  const mic = $('.mic-btn', pane);
  const input = $('.composer-input', pane);
  if (state.listeningSide === side) { stopListening(); return; }
  if (!canListen()) { toast('Bu tarayıcıda mikrofonla yazma yok. Offline mikrofon bir sonraki güncellemelerde geliyor; şimdilik yazarak kullanabilirsin.'); return; }
  if (!navigator.onLine) toast('İnternet yokken tarayıcının mikrofonu çalışmayabilir. Tam offline mikrofon yakında geliyor.');
  state.listeningSide = side;
  document.querySelectorAll('.mic-btn').forEach((m) => m.classList.remove('on'));
  mic.classList.add('on');
  listen(speechCode(state.langs[side]), {
    onPartial: (t) => { input.value = t; autoGrow(input); },
    onFinal: (t) => { input.value = ''; autoGrow(input); if (t.trim()) handleUtterance(side, t.trim()); },
    onError: (err) => {
      if (err === 'not-allowed' || err === 'service-not-allowed') toast('Mikrofon izni verilmedi.');
      else if (err === 'network') toast('Tarayıcının mikrofonu internet istiyor. Yazarak devam edebilirsin.');
      else if (err !== 'no-speech' && err !== 'aborted') toast('Ses anlaşılamadı, tekrar dene.');
    },
    onEnd: () => { mic.classList.remove('on'); if (state.listeningSide === side) state.listeningSide = null; },
  });
}

// ---------- Örnek cümleler ----------
const sheet = $('#phrase-sheet');
function openPhrases(side) {
  const lang = state.langs[side];
  const list = $('.sheet-list', sheet);
  list.innerHTML = '';
  list.dir = LANGUAGES[lang].dir;
  for (const p of examplePhrases(lang, regionOf(lang))) {
    const b = el('button', 'phrase', p);
    b.type = 'button'; b.lang = lang;
    b.addEventListener('click', () => { sheet.close(); handleUtterance(side, p); });
    list.append(b);
  }
  $('.sheet-title', sheet).textContent = lang === 'ar' ? 'جمل جاهزة' : 'Örnek cümleler';
  sheet.classList.toggle('flipped', side === 'b' && state.faceToFace && !isWide());
  sheet.showModal();
}
$('.sheet-close', sheet).addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

// ---------- Karşılıklı mod ----------
function isWide() { return window.matchMedia('(min-width: 820px)').matches; }
function applyFaceToFace() {
  document.body.classList.toggle('face-to-face', state.faceToFace);
  $('#btn-face').setAttribute('aria-pressed', String(state.faceToFace));
}
$('#btn-face').addEventListener('click', () => { state.faceToFace = !state.faceToFace; store.set('faceToFace', state.faceToFace); applyFaceToFace(); });
$('#btn-swap').addEventListener('click', swapLangs);

// ---------- Bildirim ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- Bağlantı ve offline durumu ----------
// navigator.onLine sadece ağa bağlı olup olmadığını söyler; Wi-Fi'ye bağlı ama
// internet yoksa yanılır. Bu yüzden küçük bir dosyayı gerçekten isteyerek kontrol ediyoruz.
let netState = null;
function showNet(online) {
  if (online === netState) return;
  netState = online;
  const pill = $('#net');
  pill.classList.toggle('offline', !online);
  $('.net-text', pill).textContent = online ? 'Çevrimiçi' : 'Çevrimdışı';
  pill.title = online ? 'İnternet bağlantısı var' : 'İnternet yok — ÇekÇevir yine de çalışır';
  document.body.classList.toggle('is-offline', !online);
}
async function checkNet() {
  if (!navigator.onLine) { showNet(false); return; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`manifest.webmanifest?ping=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    showNet(res.ok);
  } catch (_) {
    showNet(false);
  }
}
function updateNet() { showNet(navigator.onLine); checkNet(); }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNet(); });
setInterval(() => { if (!document.hidden) checkNet(); }, 20000);

function setOfflineReady(ready) {
  $('#offline-ready').hidden = !ready;
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      setOfflineReady(true);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('ÇekÇevir güncellendi. Yeni sürüm bir sonraki açılışta aktif.');
        });
      });
    } catch (err) {
      console.warn('[ÇekÇevir] service worker kaydedilemedi', err);
    }
  });
}

// ---------- Ana ekrana ekle ----------
let deferredPrompt = null;
const installBtn = $('#btn-install');
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
window.addEventListener('appinstalled', () => { installBtn.hidden = true; toast('ÇekÇevir ana ekrana eklendi.'); });
if (isIOS && !isStandalone()) installBtn.hidden = false;

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null; installBtn.hidden = true;
  } else if (isIOS) {
    $('#ios-help').showModal();
  } else {
    toast('Tarayıcı menüsünden "Ana ekrana ekle" seçeneğini kullanabilirsin.');
  }
});
$('#ios-help .sheet-close').addEventListener('click', () => $('#ios-help').close());

// ---------- Başlat ----------
$('#version').textContent = 'v' + APP_VERSION;
buildPane('a');
buildPane('b');
applyFaceToFace();
updateNet();
