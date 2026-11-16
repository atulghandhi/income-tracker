// File handoff from the static bank guides.
//
// A bank guide ends with the reader holding a statement file. Its drop zone
// (scripts/build-content.mjs, DROP_SCRIPT) parks that file in IndexedDB on this
// origin and navigates to /ledger#…&handoff=1. The app collects it here on load
// and opens the import review, so the reader goes from "I have the CSV" to
// "here is my month" without meeting the homepage in between.
//
// The file never leaves the browser: same-origin IndexedDB in, deleted on pickup.

const DB_NAME = "it_handoff";
const STORE = "files";
const KEY = "pending";
// A file left behind by a tab that was closed mid-navigation should not surprise
// the next visit. Ten minutes is far longer than the hop takes.
const MAX_AGE_MS = 10 * 60 * 1000;

type ParkedFile = { name?: unknown; type?: unknown; bytes?: unknown; at?: unknown };

export function hashRequestsHandoff(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, "")).has("handoff");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Returns the parked file, if there is a fresh one, and removes it either way.
// One read per page load: React's StrictMode runs effects twice in development,
// and the second run must get the same file, not find the record already gone.
let taken: Promise<File | null> | null = null;
export function takeHandoffFile(): Promise<File | null> {
  taken ??= readHandoffFile(Date.now());
  return taken;
}

async function readHandoffFile(now: number): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const parked = await new Promise<ParkedFile | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const read = store.get(KEY);
      read.onsuccess = () => {
        store.delete(KEY);
      };
      tx.oncomplete = () => resolve(read.result as ParkedFile | undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    if (!parked || !(parked.bytes instanceof ArrayBuffer) || typeof parked.at !== "number") return null;
    if (now - parked.at > MAX_AGE_MS || parked.bytes.byteLength === 0) return null;
    const name = typeof parked.name === "string" && parked.name ? parked.name.slice(0, 200) : "statement.csv";
    return new File([parked.bytes], name, { type: typeof parked.type === "string" ? parked.type : "" });
  } catch {
    // Private mode, blocked storage, a half-written record: the visitor simply
    // lands in the tracker and imports the file the usual way.
    return null;
  }
}
