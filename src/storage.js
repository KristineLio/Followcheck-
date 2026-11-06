const DB = 'followcheck-grand-prize-v1';
const STORE = 'snapshots';
let promise;
function open() {
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Your browser does not support local history.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath:'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Cannot open local storage.'));
  });
  return promise;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = operation(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onabort = () => reject(tx.error || new Error('Local storage operation failed.'));
    tx.onerror = () => reject(tx.error || new Error('Local storage operation failed.'));
  });
}
export const allSnapshots = async () => (await transaction('readonly', s => s.getAll())).sort((a,b)=> b.importedAt.localeCompare(a.importedAt));
export const saveSnapshot = value => transaction('readwrite', s => s.put(value));
export const deleteSnapshot = id => transaction('readwrite', s => s.delete(id));
export const clearSnapshots = () => transaction('readwrite', s => s.clear());