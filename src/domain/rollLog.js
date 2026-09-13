export const MAX_ROLL_LOG_ENTRIES = 500;

const validDate = (value, fallback) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;
const cleanText = (value, maximum = 160) => typeof value === "string" ? value.slice(0, maximum) : "";

export function normalizeRollLogEntry(entry = {}, { now = new Date().toISOString() } = {}) {
  const id = cleanText(entry.id, 256).trim();
  if (!id) return null;
  const outcome = entry.outcome && typeof entry.outcome === "object" && !Array.isArray(entry.outcome)
    ? {
      kind: cleanText(entry.outcome.kind, 40),
      tokenId: cleanText(entry.outcome.tokenId, 256),
      tokenName: cleanText(entry.outcome.tokenName, 160),
      ability: cleanText(entry.outcome.ability, 30),
      skillId: cleanText(entry.outcome.skillId, 80),
      modifier: Number.isFinite(Number(entry.outcome.modifier)) ? Math.floor(Number(entry.outcome.modifier)) : 0,
      rolls: Array.isArray(entry.outcome.rolls) ? entry.outcome.rolls.slice(0, 8).map((roll) => Math.floor(Number(roll) || 0)) : [],
      selectedIndex: Number.isInteger(entry.outcome.selectedIndex) ? entry.outcome.selectedIndex : -1,
      naturalRoll: Number.isFinite(Number(entry.outcome.naturalRoll)) ? Number(entry.outcome.naturalRoll) : null,
      total: Number.isFinite(Number(entry.outcome.total)) ? Number(entry.outcome.total) : null,
      dc: entry.outcome.dc === null ? null : Number.isFinite(Number(entry.outcome.dc)) ? Math.floor(Number(entry.outcome.dc)) : null,
      succeeded: typeof entry.outcome.succeeded === "boolean" ? entry.outcome.succeeded : null,
      mode: cleanText(entry.outcome.mode, 30),
      sourceBreakdown: Array.isArray(entry.outcome.modifierSources) ? entry.outcome.modifierSources.slice(0, 12).map((source) => ({
        type: cleanText(source?.type, 40),
        source: cleanText(source?.source, 80),
        value: Number.isFinite(Number(source?.value)) ? Math.floor(Number(source.value)) : 0,
      })) : [],
    }
    : null;
  return {
    id,
    sceneId: entry.sceneId ? cleanText(entry.sceneId, 256) : null,
    heroId: entry.heroId ? cleanText(entry.heroId, 256) : null,
    contextKind: ["encounter-token", "scene-token", "roster-hero"].includes(entry.contextKind) ? entry.contextKind : "scene-token",
    visibility: entry.visibility === "private" ? "private" : "public",
    line: cleanText(entry.line, 500),
    createdAt: validDate(entry.createdAt, now),
    outcome,
  };
}

export function normalizeRollLog(entries, options = {}) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).slice(-MAX_ROLL_LOG_ENTRIES).flatMap((entry) => {
    const normalized = normalizeRollLogEntry(entry, options);
    if (!normalized || seen.has(normalized.id)) return [];
    seen.add(normalized.id);
    return [normalized];
  });
}

export const appendRollLog = (entries, entry, options = {}) =>
  normalizeRollLog([...normalizeRollLog(entries, options), entry], options);
