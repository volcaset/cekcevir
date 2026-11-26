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
    for (let i = 0; i < n; i++) {
      const key = `${keyOf(f)}#${String(i).padStart(4, '0')}`;
      if (have.has(key)) continue;
      if (signal?.aborted) throw new Error('aborted');
      const start = i * CHUNK;
      const end = Math.min(size, start + CHUNK) - 1;
      const res = await fetchWithRetry(url, { headers: { Range: `bytes=${start}-${end}` }, signal });
      if (res.status !== 206) throw new Error('Sunucu parça parça indirmeyi desteklemedi');
      const blob = await res.blob();
      if (blob.size !== end - start + 1) throw new Error('Parça eksik indi');
      await tx(db, 'readwrite', (s) => s.put(blob, key));
      loaded += blob.size;
      onProgress?.({ loaded, total });
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
