// Tatoeba cümle seti motoru: insanların çevirdiği ~26 bin Türkçe–Arapça cümle.
// Cümle birebir eşleşirse yapay zekadan önce bu kullanılır (daha doğal sonuç).
// Veri: Tatoeba (https://tatoeba.org), CC BY 2.0 FR.
import { normalize } from './translator.js';

let maps = null;
let loading = null;

function load() {
  if (maps) return Promise.resolve(maps);
  if (!loading) {
    loading = fetch(new URL('../../data/tatoeba-tr-ar.json', import.meta.url))
      .then((r) => r.json())
      .then((d) => {
        const trAr = new Map();
        const arTr = new Map();
        for (const [tr, ar] of d.pairs) {
          const kt = normalize(tr, 'tr');
          const ka = normalize(ar, 'ar');
          if (!trAr.has(kt)) trAr.set(kt, ar);
          if (!arTr.has(ka)) arTr.set(ka, tr);
        }
        maps = { tr: trAr, ar: arTr };
        return maps;
      })
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}

export const tatoebaEngine = {
  id: 'tatoeba',
  label: 'Tatoeba cümle seti',
  ready: true,
  async translate(text, from, to) {
    if (!((from === 'tr' && to === 'ar') || (from === 'ar' && to === 'tr'))) return null;
    const m = await load();
    const hit = m[from].get(normalize(text, from));
    return hit ? { text: hit, engine: 'tatoeba' } : null;
  },
};
