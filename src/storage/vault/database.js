export const VAULT_STORES = Object.freeze([
  "vaultMetadata", "campaignSnapshots", "assetMetadata", "assetBlobs",
  "commandOutcomes", "pendingResolutions", "importJobs", "migrationJobs",
]);

export const requestValue = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("The database request failed."));
});

export function createVaultDatabase(indexedDB, name, { onVersionChange = () => {} } = {}) {
  let connection = null;
  const open = () => {
    if (!indexedDB) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        // Open the existing version for recovery reads. Logical reader/writer
        // capabilities, checked by the repository, gate every mutation.
        const request = indexedDB.open(name);
        let rejected = false;
        request.onupgradeneeded = () => {
          for (const store of VAULT_STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
        };
        request.onsuccess = () => {
          const db = request.result;
          if (rejected) { db.close(); return; }
          db.onversionchange = () => { db.close(); connection = null; onVersionChange(); };
          resolve(db);
        };
        request.onerror = () => { rejected = true; connection = null; reject(request.error || new Error("The vault could not open.")); };
        request.onblocked = () => {
          rejected = true; connection = null;
          const error = new Error("Another Nightforge tab is blocking the vault upgrade. Close it and retry.");
          error.name = "VaultUpgradeBlocked"; reject(error);
        };
      });
    }
    return connection;
  };
  const transaction = async (stores, mode, operation) => {
    const db = await open();
    const tx = db.transaction(stores, mode);
    const complete = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("The vault transaction was aborted."));
      tx.onerror = () => {}; // Request errors abort; completion is the commit signal.
    });
    // Attach a rejection handler immediately, including while a request is pending.
    complete.catch(() => {});
    try {
      const value = await operation(tx);
      await complete;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* It may already have aborted. */ }
      await complete.catch(() => {});
      throw error;
    }
  };
  return { open, transaction, close: async () => { const db = await connection; db?.close(); connection = null; } };
}
