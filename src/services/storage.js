/**
 * IndexedDB storage for video recordings.
 * Schema: store "recordings" with keyPath "id"
 * Fields: id, createdAt, durationSec, sizeBytes, mimeType, blob, width, height
 */

const DB_NAME = "motionwatch-db";
const DB_VERSION = 1;
const STORE = "recordings";

/** Fired on window whenever recordings are added or removed */
export const RECORDINGS_CHANGED = "mw-recordings-changed";

const notifyChanged = () => window.dispatchEvent(new Event(RECORDINGS_CHANGED));

/** @type {IDBDatabase | null} */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = /** @type {IDBOpenDBRequest} */ (e.target).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
  return dbPromise;
}

/**
 * @typedef {{
 *   id: string;
 *   createdAt: number;
 *   durationSec: number;
 *   sizeBytes: number;
 *   mimeType: string;
 *   blob: Blob;
 *   width?: number;
 *   height?: number;
 *   poster?: Blob | null;
 *   hasAudio?: boolean;
 * }} RecordingMeta
 */

/**
 * @param {Omit<RecordingMeta, 'id'> & { id?: string }} data
 * @returns {Promise<RecordingMeta>}
 */
export async function saveRecording(data) {
  const db = await openDB();
  const id = data.id || crypto.randomUUID();
  /** @type {RecordingMeta} */
  const record = {
    id,
    createdAt: data.createdAt ?? Date.now(),
    durationSec: data.durationSec,
    sizeBytes: data.sizeBytes ?? data.blob.size,
    mimeType: data.mimeType,
    blob: data.blob,
    width: data.width,
    height: data.height,
    poster: data.poster || null,
    hasAudio: !!data.hasAudio,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      notifyChanged();
      resolve(record);
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record);
  });
}

/** @returns {Promise<RecordingMeta[]>} */
export async function listRecordings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("createdAt").getAll();
    req.onsuccess = () => {
      const list = /** @type {RecordingMeta[]} */ (req.result || []);
      list.sort((a, b) => b.createdAt - a.createdAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<number>} number of stored recordings (without loading the blobs) */
export async function countRecordings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} id */
export async function getRecording(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} id */
export async function deleteRecording(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      notifyChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}

/** @param {string[]} ids */
export async function deleteRecordings(ids) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      notifyChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
  });
}

/** Estimate total size of stored recordings */
export async function getStorageUsage() {
  const list = await listRecordings();
  return list.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
}

/** Try StorageManager estimate */
export async function estimateQuota() {
  if (navigator.storage?.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch {
      return null;
    }
  }
  return null;
}

export async function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export function isStorageAvailable() {
  return typeof indexedDB !== "undefined";
}
