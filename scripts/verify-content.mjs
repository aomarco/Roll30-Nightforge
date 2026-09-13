import assert from "node:assert/strict";

import {
  CONTENT_MANIFEST,
  CONTENT_MANIFEST_META,
  CONTENT_UNRESOLVED_REFERENCES,
} from "../src/domain/content.generated.js";
import { MONSTERS, MONSTER_GENERATION_META } from "../src/domain/monsters.generated.js";

const uniqueIds = (records, label, field = "id") => {
  const ids = records.map((record) => record[field]);
  assert.equal(new Set(ids).size, ids.length, `${label} contains duplicate ${field} values.`);
  assert.ok(ids.every(Boolean), `${label} contains an empty ${field}.`);
};

uniqueIds(CONTENT_MANIFEST, "content manifest", "contentId");
uniqueIds(MONSTERS, "monster corpus");
const contentIds = new Set(CONTENT_MANIFEST.map((entry) => entry.contentId));
for (const entry of CONTENT_MANIFEST) {
  if (entry.parentContentId) assert.ok(contentIds.has(entry.parentContentId), `${entry.contentId} points to a missing parent.`);
  for (const variantId of entry.variantIds || []) assert.ok(contentIds.has(variantId), `${entry.contentId} points to a missing variant ${variantId}.`);
}
assert.equal(CONTENT_MANIFEST.length, CONTENT_MANIFEST_META.emittedCount, "Content manifest count does not match its metadata.");
assert.equal(CONTENT_UNRESOLVED_REFERENCES.length, CONTENT_MANIFEST_META.unresolvedReferenceCount, "Content reference metadata is stale.");
assert.equal(CONTENT_UNRESOLVED_REFERENCES.length, 0, "Content manifest has unresolved references.");
assert.equal(MONSTERS.length, MONSTER_GENERATION_META.emittedCount, "Monster corpus count does not match its metadata.");
assert.equal(MONSTER_GENERATION_META.sourceCount, MONSTER_GENERATION_META.emittedCount, "Monster generation dropped source records.");

for (const monster of MONSTERS) {
  assert.ok(monster.sourceRecordId && monster.sourceDatasetHash && monster.definitionVersion && monster.parserVersion, `${monster.id} is missing source metadata.`);
  uniqueIds(monster.actionCapabilities || [], `${monster.id} action capabilities`);
  assert.ok((monster.actionCapabilities || []).every((entry) => ["implemented", "assisted", "reference-only"].includes(entry.status)), `${monster.id} has an unknown capability status.`);
}

const adultRedDragon = MONSTERS.find((monster) => monster.id === "adult-red-dragon");
assert.deepEqual(adultRedDragon.saveTotals, { dex: 6, con: 13, wis: 7, cha: 11 });
assert.equal(adultRedDragon.passivePerception, 23);
const guardSpear = MONSTERS.find((monster) => monster.id === "guard").attacks.find((attack) => attack.name === "Spear");
assert.deepEqual(guardSpear.rangeModes.map((mode) => mode.kind), ["melee", "ranged"]);
assert.deepEqual(guardSpear.damageVariants.map((variant) => variant.damageDice), ["1d6+1", "1d8+1"]);
const druidQuarterstaff = MONSTERS.find((monster) => monster.id === "druid").attacks.find((attack) => attack.name === "Quarterstaff");
assert.deepEqual(druidQuarterstaff.damageVariants.map((variant) => variant.damageDice), ["1d6", "1d8", "1d8+2"]);

console.log(JSON.stringify({
  content: { emitted: CONTENT_MANIFEST.length, sources: CONTENT_MANIFEST_META.sourceCounts, unresolved: CONTENT_UNRESOLVED_REFERENCES.length },
  monsters: { emitted: MONSTERS.length, source: MONSTER_GENERATION_META.sourceCount, capabilities: MONSTER_GENERATION_META.generatedCapabilityCounts },
}, null, 2));
