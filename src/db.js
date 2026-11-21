const DB_NAME = "edoc";
const STORE = "kv";

// One connection, opened on first use and reused: opening a fresh one for
// every read and write never closed them, and they piled up.
let dbPromise = null;

function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      // Let a deleted or upgraded database go through, and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// A write the browser refuses (storage full) ends in "abort", not "error",
// so it has to be listened for or the promise never settles.
async function write(run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was aborted"));
  });
}

export const dbSet = (key, value) => write((store) => store.put(value, key));
