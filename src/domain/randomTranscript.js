const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const randomUnit = (random) => Math.max(0, Math.min(0.999999999999, finite(random?.(), 0)));

const copy = (value) => value.map((entry) => ({ ...entry }));

/**
 * A roll transcript makes randomness part of a committed result. The normal
 * domain functions can still receive a random callback, while command callers
 * can retain the exact draw order needed to replay or inspect the outcome.
 */
export function createRandomTranscript({ random = Math.random, prior = null } = {}) {
  const entries = Array.isArray(prior?.rolls) ? copy(prior.rolls) : [];
  const decisions = Array.isArray(prior?.decisions) ? copy(prior.decisions) : [];
  let cursor = 0;
  let decisionCursor = 0;
  const roll = (sides, kind = "d20") => {
    const normalizedSides = Math.max(1, Math.floor(finite(sides, 1)));
    const existing = prior?.rolls?.[cursor];
    if (existing) {
      if (existing.sides !== normalizedSides || existing.kind !== kind) {
        const error = new Error("The supplied random transcript does not match the requested roll.");
        error.code = "random-transcript-mismatch";
        throw error;
      }
      cursor += 1;
      return existing.value;
    }
    const value = Math.floor(randomUnit(random) * normalizedSides) + 1;
    entries.push({ kind, sides: normalizedSides, drawOrder: entries.length, value });
    cursor += 1;
    return value;
  };
  const record = (decision = {}) => {
    const normalized = { ...decision, order: decisionCursor };
    const existing = prior?.decisions?.[decisionCursor];
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
        const error = new Error("The supplied random transcript does not match the requested decision.");
        error.code = "random-transcript-mismatch";
        throw error;
      }
      decisionCursor += 1;
      return existing;
    }
    decisions.push(normalized);
    decisionCursor += 1;
    return normalized;
  };
  return {
    roll,
    record,
    snapshot: () => ({ version: 1, rolls: copy(entries), decisions: copy(decisions) }),
    get count() { return entries.length; },
  };
}

export const rollFromTranscript = (transcript, sides, kind = "d20") => {
  const source = createRandomTranscript({ prior: transcript });
  return { value: source.roll(sides, kind), transcript: source.snapshot() };
};
