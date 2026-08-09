export function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  let failureMode = null;

  const maybeFail = (operation) => {
    if (failureMode === operation || failureMode === "all") {
      throw new Error(`Memory storage ${operation} failure.`);
    }
  };

  return {
    getItem(key) {
      maybeFail("read");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      maybeFail("write");
      values.set(key, String(value));
    },
    removeItem(key) {
      maybeFail("write");
      values.delete(key);
    },
    setFailureMode(mode) {
      failureMode = mode;
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

export function createMemoryArtworkAdapter(seed = {}) {
  const values = new Map(Object.entries(seed));
  let failureOperation = null;
  const maybeFail = (operation) => {
    if (failureOperation === operation || failureOperation === "all") {
      throw new Error(`Memory artwork ${operation} failure.`);
    }
  };
  return {
    async get(key) {
      maybeFail("get");
      return values.get(key) ?? null;
    },
    async put(key, blob) {
      maybeFail("put");
      values.set(key, blob);
      return key;
    },
    async remove(key) {
      maybeFail("remove");
      values.delete(key);
    },
    async keys() {
      maybeFail("keys");
      return [...values.keys()];
    },
    setFailureOperation(operation) {
      failureOperation = operation;
    },
  };
}

