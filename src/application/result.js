export const success = (value, extra = {}) => ({
  ok: true,
  value,
  ...extra,
});

export const failure = (
  code,
  message,
  { recovery = "Retry the operation.", retryable = true, cause } = {},
) => ({
  ok: false,
  code,
  message,
  recovery,
  retryable,
  ...(cause === undefined ? {} : { cause }),
});

export const fromThrown = (
  code,
  message,
  error,
  recovery = "Retry the operation.",
) =>
  failure(code, message, {
    recovery,
    retryable: true,
    cause: error instanceof Error ? error.message : String(error),
  });

