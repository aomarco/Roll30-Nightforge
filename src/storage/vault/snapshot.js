import { normalizeEnvelope } from "../envelope.js";
import { assetReferences, validateStateGraph } from "../archive/format.js";

/** Keep unrecognized source fields as inert recovery records. Their absence
 * from today's UI is never permission to destroy them on the next save. */
export function prepareSnapshot(input, now) {
  validateStateGraph(input);
  const normalized = normalizeEnvelope(input, now);
  const quarantine = structuredClone(input.quarantine || []);
  const ignored = new Set(["checksum", "vaultGeneration", "quarantine", "campaign", "pendingResolutions"]);
  const inspect = (source, target, path) => {
    if (!source || typeof source !== "object") {
      if (source !== target) quarantine.push({ path, reason: "normalized-value", value: source });
      return;
    }
    if (Array.isArray(source)) {
      for (const [index, entry] of source.entries()) {
        const matched = entry?.id ? target?.find?.((candidate) => candidate.id === entry.id) : target?.[index];
        if (matched === undefined) quarantine.push({ path: `${path}/${index}`, reason: "unrecognized-record", value: entry });
        else inspect(entry, matched, `${path}/${entry?.id || index}`);
      }
      return;
    }
    for (const [key, value] of Object.entries(source)) {
      if (!path && ignored.has(key)) continue;
      if (!Object.hasOwn(target || {}, key)) quarantine.push({ path: `${path}/${key}`, reason: "unrecognized-field", value });
      else inspect(value, target[key], `${path}/${key}`);
    }
  };
  inspect(input, normalized, "");
  const unique = [...new Map(quarantine.map((entry) => [JSON.stringify(entry), entry])).values()];
  return { ...normalized, quarantine: unique, pendingResolutions: structuredClone(input.pendingResolutions || []), campaign: input.campaign || {
    id: "default-campaign", title: "My campaign", rules: { edition: "2014", source: "SRD 5.1", version: 1 },
    sceneIds: normalized.scenes.map((scene) => scene.id), heroIds: normalized.heroes.map((hero) => hero.id),
  } };
}

export const snapshotReferences = (snapshot) => assetReferences(snapshot?.state || snapshot || {});
export const assetId = (generation, kind, key) => JSON.stringify([generation, kind, key]);
