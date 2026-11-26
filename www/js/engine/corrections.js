// Kullanıcı düzeltmeleri ("Çeviriyi düzenle").
// Düzeltmeler cihazda saklanır ve çeviride her şeyden önce kullanılır.
// Adım 4'te Supabase'e gönderilip herkesin ortak sözlüğüne katılacak.
import { normalize } from './translator.js';

const KEY = 'cc:corrections';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; }
}
function save(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* depolama kapalı */ }
}
const keyOf = (text, from, to) => `${from}>${to}:${normalize(text, from)}`;

export function saveCorrection(source, from, to, fixed) {
  const all = load();
  const k = keyOf(source, from, to);
  if (!fixed || !fixed.trim()) delete all[k];
  else all[k] = { source, from, to, text: fixed.trim(), at: Date.now(), synced: false };
  save(all);
}

export function allCorrections() { return Object.values(load()); }

export const correctionsEngine = {
  id: 'user',
  label: 'Senin düzeltmen',
  ready: true,
  async translate(text, from, to) {
    const hit = load()[keyOf(text, from, to)];
    return hit ? { text: hit.text, engine: this.id } : null;
  },
};
