import type { SyncMeta } from "./sync/engine";
import type { LedgerState } from "./types";

const DB_NAME = "ledgerlite-local-db";
const DB_VERSION = 1;
const STORE_NAME = "ledger";
const STATE_KEY = "state";

function openLedgerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLedgerState(): Promise<LedgerState | null> {
  if (!("indexedDB" in window)) {
    return null;
  }

  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY);

    request.onsuccess = () => resolve((request.result as LedgerState | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveLedgerState(state: LedgerState): Promise<void> {
  if (!("indexedDB" in window)) {
    localStorage.setItem("ledgerlite-fallback-state", JSON.stringify(state));
    return;
  }

  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(state, STATE_KEY);

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

// ─── Sync bookkeeping (Sync v2) ──────────────────────────────────────────────
// The last state this browser knows the server holds, and its revision. Kept beside
// the ledger so a reload can tell "I edited offline" from "another device edited".

const SYNC_META_KEY = "syncMeta";
const DEVICE_ID_KEY = "it_device_id";

export async function loadSyncMeta(userId: string): Promise<SyncMeta | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(SYNC_META_KEY);
    request.onsuccess = () => {
      const meta = request.result as SyncMeta | undefined;
      resolve(meta && meta.userId === userId ? meta : null);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveSyncMeta(meta: SyncMeta): Promise<void> {
  if (!("indexedDB" in window)) return;
  await writeKey(SYNC_META_KEY, meta);
}

export async function clearSyncMeta(): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(SYNC_META_KEY);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

async function writeKey(key: string, value: unknown): Promise<void> {
  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).put(value, key);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

// A random id for this browser, so it can recognise its own realtime echoes.
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `web-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `web-${crypto.randomUUID()}`;
  }
}
