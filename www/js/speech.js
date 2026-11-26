// Ses: mikrofonla yazıya dökme ve sesli okuma.
// Adım 1: tarayıcının hazır ses tanıması (çoğu telefonda internet ister).
// Adım 3: Whisper modeli ile tamamen offline ses tanıma buraya eklenecek.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function canListen() { return Boolean(Recognition); }

let current = null;

export function listen(langCode, { onPartial, onFinal, onEnd, onError } = {}) {
  if (!Recognition) { onError?.('unsupported'); return null; }
  stopListening();
  const rec = new Recognition();
  rec.lang = langCode;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    if (final) onFinal?.(text); else onPartial?.(text);
  };
  rec.onerror = (e) => onError?.(e.error || 'error');
  rec.onend = () => { if (current === rec) current = null; onEnd?.(); };
  try { rec.start(); current = rec; } catch (err) { onError?.('start'); return null; }
  return rec;
}

export function stopListening() {
  if (current) { try { current.stop(); } catch (_) { /* yok say */ } current = null; }
}

export function canSpeak() { return 'speechSynthesis' in window; }

export function speak(text, langCode) {
  if (!canSpeak() || !text) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langCode;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith(langCode.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}
