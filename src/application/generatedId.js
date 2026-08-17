export const generatedId = (kind, factory, records = []) => {
  let id;
  try {
    id = factory();
  } catch (error) {
    return {
      ok: false,
      code: `${kind.toUpperCase()}_ID_FAILED`,
      message: `Nightforge could not create a stable ${kind} id.`,
      recovery: "Retry the operation; no Table state was changed.",
      retryable: true,
      cause: error instanceof Error ? error.message : String(error),
    };
  }
  if (typeof id !== "string" || !id.trim() || records.some((record) => record.id === id.trim())) {
    return {
      ok: false,
      code: `${kind.toUpperCase()}_ID_CONFLICT`,
      message: `Nightforge generated a duplicate or invalid ${kind} id.`,
      recovery: "Retry the operation; no Table state was changed.",
      retryable: true,
    };
  }
  return { ok: true, value: id.trim() };
};
