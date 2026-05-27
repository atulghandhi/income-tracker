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
