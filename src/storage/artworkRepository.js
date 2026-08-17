import { fromThrown, isQuotaExceededError, success } from "../application/result.js";
import { ARTWORK_DATABASE, ARTWORK_STORE } from "./constants.js";

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });

export function createIndexedDbArtworkAdapter(
  indexedDbFactory = globalThis.indexedDB,
  { databaseName = ARTWORK_DATABASE, storeName = ARTWORK_STORE } = {},
) {
  let databasePromise;

  const database = () => {
    if (!indexedDbFactory) return Promise.reject(new Error("IndexedDB is unavailable."));
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDbFactory.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB could not open."));
        request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked."));
      });
    }
    return databasePromise;
  };

  const transaction = async (mode, operation) => {
    const db = await database();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const completion = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
    const result = await operation(store);
    await completion;
    return result;
  };

  return {
    get: (key) => transaction("readonly", (store) => requestResult(store.get(key))),
    put: (key, blob) => transaction("readwrite", (store) => requestResult(store.put(blob, key))),
    remove: (key) => transaction("readwrite", (store) => requestResult(store.delete(key))),
    keys: () => transaction("readonly", (store) => requestResult(store.getAllKeys())),
  };
}

export function createArtworkRepository(adapter) {
  if (!adapter) throw new TypeError("ArtworkRepository requires an artwork adapter.");

  const invoke = async (operation, args, failureDetails) => {
    try {
      return success(await adapter[operation](...args));
    } catch (error) {
      if (operation === "put" && isQuotaExceededError(error)) {
        return fromThrown(
          "artwork-quota-exceeded",
          "Nightforge artwork storage is full.",
          error,
          "Remove unused Scene artwork or choose a smaller image, then retry. Your previous artwork remains active.",
        );
      }
      return fromThrown(
        failureDetails.code,
        failureDetails.message,
        error,
        failureDetails.recovery,
      );
    }
  };

  return {
    get: (key) =>
      invoke("get", [key], {
        code: "artwork-read-failed",
        message: "Nightforge could not load Scene artwork.",
        recovery: "Keep the Scene open and retry loading the artwork.",
      }),
    put: (key, blob) =>
      invoke("put", [key, blob], {
        code: "artwork-write-failed",
        message: "Nightforge could not save Scene artwork.",
        recovery: "Your previous artwork remains active. Retry with this or a smaller image.",
      }),
    remove: (key) =>
      invoke("remove", [key], {
        code: "artwork-delete-failed",
        message: "Nightforge could not remove stored Scene artwork.",
        recovery: "The cleanup will be safe to retry later.",
      }),
    keys: () =>
      invoke("keys", [], {
        code: "artwork-list-failed",
        message: "Nightforge could not inspect stored Scene artwork.",
        recovery: "Retry before running artwork cleanup.",
      }),
  };
}
