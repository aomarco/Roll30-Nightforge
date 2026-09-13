import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const sourceDirectory = valueFor("--source-dir") || args[0];
const outputFile = valueFor("--output") || path.resolve("src/domain/content.generated.js");
if (!sourceDirectory) {
  throw new Error("Usage: node scripts/generate-content-manifests.mjs --source-dir <SRD directory> [--output <file>]");
}

const EDITION = "2014 / SRD 5.1";
const DEFINITION_VERSION = 1;
const slug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const readSource = async (file) => {
  const text = await readFile(path.join(sourceDirectory, file), "utf8");
  return { value: JSON.parse(text), hash: createHash("sha256").update(text).digest("hex").toUpperCase() };
};
const array = (value) => Array.isArray(value) ? value : [];
const recordName = (entry) => entry?.name || entry?.index || "Unnamed definition";
const sourceFiles = Object.freeze({
  spells: "5e-SRD-Spells.json",
  classes: "5e-SRD-Classes.json",
  features: "5e-SRD-Features.json",
  feats: "5e-SRD-Feats.json",
  equipment: "5e-SRD-Equipment.json",
  magicItems: "5e-SRD-Magic-Items.json",
  subclasses: "5e-SRD-Subclasses.json",
});

const sources = Object.fromEntries(await Promise.all(Object.entries(sourceFiles).map(async ([kind, file]) => [kind, await readSource(file)])));
const sourceId = (kind, entry) => entry?.index || `${kind}-${slug(recordName(entry))}`;
const contentId = (kind, entry) => `${kind}:${sourceId(kind, entry)}`;
const record = (kind, entry, extra = {}) => ({
  contentId: contentId(kind, entry),
  sourceRecordId: sourceId(kind, entry),
  name: recordName(entry),
  contentKind: kind,
  edition: EDITION,
  sourceDataset: sourceFiles[kind],
  sourceDatasetHash: sources[kind].hash,
  definitionVersion: DEFINITION_VERSION,
  ownerPhase: kind === "spells" ? "P11-P13" : ["classes", "features", "subclasses"].includes(kind) ? "P14-P18" : kind === "feats" ? "P19" : "P21",
  behaviorFamily: extra.behaviorFamily || "reference",
  implementedOperations: extra.implementedOperations || [],
  manualNarrativeRequirements: extra.manualNarrativeRequirements || ["GM adjudication required until the owning phase ships"],
  prerequisites: extra.prerequisites || [],
  parentContentId: extra.parentContentId || null,
  variantOf: extra.variantOf || null,
  variantIds: extra.variantIds || [],
  capabilityStatus: extra.capabilityStatus || "specified",
  warnings: extra.warnings || [],
});

const spellFamily = (entry) => {
  if (entry.damage?.damage_at_slot_level || entry.damage?.damage_at_character_level) return entry.attack_type ? "attack-damage" : "save-damage";
  if (entry.concentration) return "concentration-utility";
  if (entry.area_of_effect) return "area-utility";
  return "utility";
};
const spells = array(sources.spells.value).map((entry) => record("spells", entry, {
  behaviorFamily: spellFamily(entry),
  prerequisites: [
    ...(entry.concentration ? ["persistent-effects"] : []),
    ...(entry.damage ? ["damage-resolution"] : []),
    ...(entry.classes || []).map((item) => item.index || item.name).filter(Boolean),
  ],
}));

const classes = array(sources.classes.value).map((entry) => record("classes", entry, {
  behaviorFamily: "class-progression",
  prerequisites: array(entry.subclasses).map((item) => item.index || item.name).filter(Boolean),
  variantIds: array(entry.subclasses).map((item) => `subclasses:${item.index || slug(item.name)}`).filter(Boolean),
}));
const subclasses = array(sources.subclasses.value).map((entry) => record("subclasses", entry, {
  behaviorFamily: "subclass-progression",
  prerequisites: [entry.class?.index || entry.class?.name].filter(Boolean),
  parentContentId: entry.class?.index ? `classes:${entry.class.index}` : null,
}));
const features = array(sources.features.value).map((entry) => record("features", entry, {
  behaviorFamily: "class-feature",
  prerequisites: [entry.class?.index || entry.class?.name, entry.level ? `level:${entry.level}` : null].filter(Boolean),
  parentContentId: entry.class?.index ? `classes:${entry.class.index}` : null,
}));
const feats = array(sources.feats.value).map((entry) => record("feats", entry, {
  behaviorFamily: "feat",
  prerequisites: array(entry.prerequisites).map((item) => item.ability_score?.index || item.proficiency?.index || item.name).filter(Boolean),
}));
const equipment = array(sources.equipment.value).map((entry) => record("equipment", entry, {
  behaviorFamily: entry.equipment_category?.name === "Weapon" ? "weapon" : entry.equipment_category?.name === "Armor" ? "armor" : "gear",
  capabilityStatus: "supported-by-catalogue",
}));
const magicItems = array(sources.magicItems.value).map((entry) => record("magicItems", entry, {
  behaviorFamily: "magic-item",
  capabilityStatus: "reference-only",
}));

const all = [...spells, ...classes, ...subclasses, ...features, ...feats, ...equipment, ...magicItems]
  .sort((left, right) => left.contentKind.localeCompare(right.contentKind) || left.contentId.localeCompare(right.contentId));
const knownIds = new Set(all.flatMap((entry) => [entry.contentId, entry.sourceRecordId]));
const unresolvedReferences = [];
for (const entry of all) {
  for (const prerequisite of entry.prerequisites) {
    if (/^(?:level:\d+|str|dex|con|int|wis|cha|persistent-effects|damage-resolution|area-utility|concentration-utility|save-damage|attack-damage|utility|class-progression|subclass-progression|class-feature|feat|weapon|armor|gear|magic-item)$/.test(prerequisite)) continue;
    if (!knownIds.has(prerequisite) && !prerequisite.includes(" ")) unresolvedReferences.push({ contentId: entry.contentId, reference: prerequisite });
  }
}

const summary = {
  edition: EDITION,
  definitionVersion: DEFINITION_VERSION,
  sourceFiles,
  sourceHashes: Object.fromEntries(Object.entries(sources).map(([kind, source]) => [kind, source.hash])),
  sourceCounts: Object.fromEntries(Object.entries(sources).map(([kind, source]) => [kind, array(source.value).length])),
  emittedCount: all.length,
  unresolvedReferenceCount: unresolvedReferences.length,
};
const output = [
  "// Generated from explicitly supplied local SRD 5.1 inputs.",
  "// Regenerate with scripts/generate-content-manifests.mjs; do not edit by hand.",
  `export const CONTENT_MANIFEST_META = Object.freeze(${JSON.stringify(summary, null, 2)});`,
  `export const CONTENT_MANIFEST = Object.freeze(${JSON.stringify(all, null, 2)});`,
  `export const CONTENT_UNRESOLVED_REFERENCES = Object.freeze(${JSON.stringify(unresolvedReferences, null, 2)});`,
  "",
].join("\n\n");
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, output, "utf8");
console.log(`Generated ${all.length} content manifest records from ${Object.keys(sourceFiles).length} explicit source files (${unresolvedReferences.length} unresolved references).`);
