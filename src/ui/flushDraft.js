// Navigation and the debounce timer share one drain. Keep each dirty field
// until its captured value commits; typing during an IndexedDB save survives.
export function flushDirtyDraft({ pendingRef, dirtyRef, draftRef, save, onSaved, onError }) {
  if (pendingRef.current) return pendingRef.current;
  const drain = async () => {
    let result = { ok: true };
    while (dirtyRef.current.size) {
      const fields = [...dirtyRef.current];
      const patch = Object.fromEntries(fields.map((field) => [field, draftRef.current[field]]));
      try { result = await save(patch); }
      catch (error) { result = { ok: false, message: error.message, recovery: "Your draft is still here. Retry saving." }; }
      if (!result?.ok) { onError(result); return result; }
      for (const field of fields) {
        if (draftRef.current[field] === patch[field]) {
          dirtyRef.current.delete(field);
          draftRef.current[field] = result.value?.[field] ?? patch[field];
        }
      }
      onSaved({ ...draftRef.current });
    }
    return result;
  };
  pendingRef.current = drain().finally(() => { pendingRef.current = null; });
  return pendingRef.current;
}
