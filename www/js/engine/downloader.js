// Kaldığı yerden devam eden model indirici.
// Büyük dosyalar 16 MB'lık parçalar halinde indirilir ve her parça hemen
// cihaza (IndexedDB) yazılır. Bağlantı koparsa bir sonraki denemede sadece
// eksik parçalar iner. Dosya tamamlanınca Transformers.js'in okuduğu
// önbelleğe (Cache Storage) tek parça olarak konur.

const CHUNK = 16 * 1024 * 1024;
const DB_NAME = 'cekcevir-downloads';
const STORE = 'chunks';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function existingChunks(db, file) { // file: 'model/id/dosya'
  const keys = await tx(db, 'readonly', (s) => reqP(s.getAllKeys(IDBKeyRange.bound(file + '#', file + '#￿'))));
  return new Set(keys);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, init, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status === 206) return res;
      lastErr = new Error('HTTP ' + res.status);
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
      if (!navigator.onLine) break;
    }
    await sleep(1500 * 2 ** i);
  }
  throw lastErr;
}

// Parça (Range) isteği çalışıyor mu? Çalışan adresi döner, çalışmıyorsa null.
// Bazı tarayıcılar (iPhone Safari) yönlendirmeden sonra Range başlığını
// düşürür; o durumda yönlendirilen gerçek adresi doğrudan deneriz.
async function probeRange(url, signal) {
  const tryOne = async (u) => {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(u, { headers: { Range: 'bytes=0-0' }, signal: ctrl.signal });
      const ok = res.status === 206;
      const finalUrl = res.url;
      ctrl.abort(); // 200 dönerse tüm dosyayı indirmesin
      return { ok, finalUrl };
    } catch (_) {
      return { ok: false, finalUrl: '' };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  };
  const first = await tryOne(url);
  if (first.ok) return url;
  if (first.finalUrl && first.finalUrl !== url) {
    const second = await tryOne(first.finalUrl);
    if (second.ok) return first.finalUrl;
  }
  return null;
}

// Model deposundaki dosya boyutlarını öğren
export async function listSizes(modelId, files) {
  const sizes = {};
  const dirs = [...new Set(files.map((f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')))];
  for (const dir of dirs) {
    const res = await fetchWithRetry(`https://huggingface.co/api/models/${modelId}/tree/main${dir ? '/' + dir : ''}`);
    for (const item of await res.json()) sizes[item.path] = item.lfs?.size ?? item.size;
  }
  return sizes;
}

// files: ['onnx/encoder_model_quantized.onnx', ...]
// onProgress({ loaded, total })
export async function downloadModel({ modelId, files, cacheName, onProgress, signal }) {
  const sizes = await listSizes(modelId, files);
  const total = files.reduce((a, f) => a + (sizes[f] || 0), 0);
  const cache = await caches.open(cacheName);
  const db = await openDb();
  const urlOf = (f) => `https://huggingface.co/${modelId}/resolve/main/${f}`;

  // Daha önce tamamlananları ve diskteki parçaları say
  let loaded = 0;
  const done = new Set();
  const keyOf = (f) => `${modelId}/${f}`;
  for (const f of files) {
    if (await cache.match(urlOf(f))) { done.add(f); loaded += sizes[f] || 0; continue; }
    const have = await existingChunks(db, keyOf(f));
    for (const k of have) {
      const i = Number(k.split('#')[1]);
      loaded += Math.min(CHUNK, (sizes[f] || 0) - i * CHUNK);
    }
  }
  onProgress?.({ loaded, total });

  for (const f of files) {
    if (done.has(f)) continue;
    if (signal?.aborted) throw new Error('aborted');
    const size = sizes[f];
    const url = urlOf(f);

    if (!size || size <= CHUNK) {
      const res = await fetchWithRetry(url, { signal });
      const blob = await res.blob();
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(blob.size) } }));
      loaded += size || blob.size;
      onProgress?.({ loaded, total });
      continue;
    }

    const n = Math.ceil(size / CHUNK);
    const have = await existingChunks(db, keyOf(f));
    const chunkKey = (i) => `${keyOf(f)}#${String(i).padStart(4, '0')}`;
    let target = await probeRange(url, signal);

    if (target) {
      // Parça parça (Range) indirme: kopan bağlantıda sadece eksik parçalar iner
      for (let i = 0; i < n; i++) {
        const key = chunkKey(i);
        if (have.has(key)) continue;
        if (signal?.aborted) throw new Error('aborted');
        const start = i * CHUNK;
        const end = Math.min(size, start + CHUNK) - 1;
        let res;
        try {
          res = await fetchWithRetry(target, { headers: { Range: `bytes=${start}-${end}` }, signal });
        } catch (err) {
          // İmzalı adresin süresi dolmuş olabilir: yeniden çöz ve bir kez dene
          target = await probeRange(url, signal);
          if (!target) throw err;
          res = await fetchWithRetry(target, { headers: { Range: `bytes=${start}-${end}` }, signal });
        }
        if (res.status !== 206) throw new Error('Sunucu parça parça indirmeyi desteklemedi');
        const blob = await res.blob();
        if (blob.size !== end - start + 1) throw new Error('Parça eksik indi');
        await tx(db, 'readwrite', (s) => s.put(blob, key));
        loaded += blob.size;
        onProgress?.({ loaded, total });
      }
    } else {
      // Yedek yol (ör. bazı iPhone Safari sürümleri): dosyayı tek akışta indir,
      // 16 MB'lık parçalar halinde cihaza yaz. Kopan indirme bu dosyayı baştan
      // indirir ama diğer tamamlanmış dosyalar korunur.
      for (const k of have) loaded -= Math.min(CHUNK, size - Number(k.split('#')[1]) * CHUNK);
      await tx(db, 'readwrite', (s) => s.delete(IDBKeyRange.bound(keyOf(f) + '#', keyOf(f) + '#\uffff')));
      onProgress?.({ loaded, total });
      const res = await fetchWithRetry(url, { signal });
      const reader = res.body.getReader();
      let pending = [];
      let pendingLen = 0;
      let idx = 0;
      const flush = async (final) => {
        while (pendingLen >= CHUNK || (final && pendingLen > 0)) {
          const blob = new Blob(pending);
          const piece = blob.slice(0, Math.min(CHUNK, blob.size));
          const rest = blob.slice(piece.size);
          await tx(db, 'readwrite', (s) => s.put(piece, chunkKey(idx)));
          idx++;
          pending = rest.size ? [rest] : [];
          pendingLen = rest.size;
        }
      };
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        pending.push(value);
        pendingLen += value.length;
        loaded += value.length;
        onProgress?.({ loaded, total });
        if (pendingLen >= CHUNK) await flush(false);
      }
      await flush(true);
    }

    // Parçaları birleştir ve önbelleğe koy
    const keys = [...(await existingChunks(db, keyOf(f)))].sort();
    const parts = [];
    for (const k of keys) parts.push(await tx(db, 'readonly', (s) => reqP(s.get(k))));
    const whole = new Blob(parts, { type: 'application/octet-stream' });
    if (whole.size !== size) throw new Error('Dosya boyutu tutmadı, tekrar indirilecek');
    await cache.put(url, new Response(whole, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) } }));
    await tx(db, 'readwrite', (s) => s.delete(IDBKeyRange.bound(keyOf(f) + '#', keyOf(f) + '#\uffff')));
  }
  db.close();
  return { total };
}

export async function clearPartial(modelId) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(IDBKeyRange.bound(modelId + '/', modelId + '/\uffff')));
    db.close();
  } catch (_) { /* yok say */ }
}

export async function partialBytes(modelId) {
  try {
    const db = await openDb();
    const blobs = await tx(db, 'readonly', (s) => reqP(s.getAll(IDBKeyRange.bound(modelId + '/', modelId + '/\uffff'))));
    db.close();
    return blobs.reduce((a, b) => a + (b?.size || 0), 0);
  } catch (_) { return 0; }
}
