/**
 * Lưu kết quả tra cứu S2 theo từng port (IndexedDB) — chỉ trên máy người đồng bộ.
 */

import { sp2CacheKey } from './sp2-cache-key';

const DB_NAME = 'tracuu_sp2_cache';
const DB_VERSION = 1;
const STORE_PORTS = 'ports';
const STORE_META = 'meta';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PORTS)) {
        db.createObjectStore(STORE_PORTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };
  });
}

export { sp2CacheKey };

export async function authFingerprint(auth) {
  const s = (auth && String(auth).trim()) || '';
  if (!s) return '';
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return String(s.length) + ':' + s.slice(-16);
  }
}

export async function putPortCache(key, fingerprint, data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PORTS, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_PORTS).put({
      key,
      authFingerprint: fingerprint,
      data: Array.isArray(data) ? data : [],
      updatedAt: Date.now(),
    });
  });
}

/**
 * Đọc kết quả tra cứu đã đồng bộ cho port (IndexedDB).
 * Không lọc theo fingerprint: khi Authorization hết hạn hoặc đổi, vẫn đọc được bản cache mới nhất trên máy này.
 * @param {string} fingerprint Vẫn nhận tham số để tương thích gọi cũ; không dùng khi đọc.
 */
export async function getPortCache(key, fingerprint) {
  void fingerprint;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PORTS, 'readonly');
    const req = tx.objectStore(STORE_PORTS).get(key);
    req.onsuccess = () => {
      const v = req.result;
      if (!v) resolve(null);
      else resolve(Array.isArray(v.data) ? v.data : []);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearPortsCache() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PORTS, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_PORTS).clear();
  });
}

export async function setSyncMeta(partial) {
  const prev = await getSyncMeta();
  const base = prev && typeof prev === 'object' ? prev : {};
  const next = { ...base, id: 'sync', ...partial, id: 'sync' };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_META).put(next);
  });
}

export async function getSyncMeta() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get('sync');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
