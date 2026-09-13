import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { createVaultRepository } from "./storage/vault/repository.js";
import { requestValue } from "./storage/vault/database.js";
import { createEmptyEnvelope } from "./storage/envelope.js";
import { createSceneRecord } from "./domain/records.js";
const now = "2026-09-06T12:00:00.000Z";
const png = new Blob(["test image"], { type: "image/png" });
function harness() {
  let failure = null, sequence = 0;
  const factory = new IDBFactory();
  const options = { name: "test-vault", clock: () => now, idFactory: () => `id-${++sequence}`, fault: (point) => { if (point === failure) throw new Error(`Injected ${point}`); } };
  return { vault: createVaultRepository(factory, options), reopen: () => createVaultRepository(factory, options), failAt: (point) => { failure = point; } };
}

test("vault saves atomically and rejects concurrent stale snapshots", async () => {
  const { vault, reopen } = harness();
  const opened = await vault.initializeEmpty(); assert.equal(opened.ok, true);
  const other = reopen(); const stale = await other.load();
  const first = await vault.save({ ...opened.value, scenes: [createSceneRecord({ name: "Saved" }, { id: "scene", now })] });
  assert.equal(first.ok, true);
  assert.equal((await other.save(stale.value)).code, "storage-revision-conflict");
  assert.equal((await other.load()).value.scenes[0].name, "Saved");
});

test("transaction abort rolls back backup, snapshot, outcome and pending resolution together", async () => {
  for (const point of ["save-after-backup", "save-after-snapshot", "save-after-outcome"]) {
    const { vault, failAt } = harness(); const initial = await vault.initializeEmpty();
    failAt(point);
    const failed = await vault.save({ ...initial.value, scenes: [createSceneRecord({}, { id: "new", now })] }, { commandId: "command", pending: [{ id: "choice", phase: "waiting" }] });
    assert.equal(failed.ok, false, point); failAt(null);
    assert.equal((await vault.load()).value.scenes.length, 0);
    const stores = await vault.database.transaction(["commandOutcomes", "pendingResolutions"], "readonly", async (tx) => Promise.all([requestValue(tx.objectStore("commandOutcomes").getAll()), requestValue(tx.objectStore("pendingResolutions").getAll())]));
    assert.deepEqual(stores, [[], []]);
  }
});

test("interrupted staged import resumes without changing the active collection early", async () => {
  const { vault, reopen, failAt } = harness(); await vault.initializeEmpty();
  const state = { ...createEmptyEnvelope(now), scenes: [createSceneRecord({ name: "Imported", artworkKey: "map" }, { id: "scene", now })] };
  const input = { state, assets: [{ kind: "artwork", key: "map", blob: png }], fingerprint: "source" };
  failAt("import-after-asset"); assert.equal((await vault.stageImport(input, { jobId: "resume" })).ok, false);
  assert.equal((await vault.load()).value.scenes.length, 0);
  failAt(null); const next = reopen();
  assert.equal((await next.stageImport(input, { jobId: "resume" })).ok, true);
  assert.equal((await next.activateImport("resume")).ok, true);
  assert.equal((await next.load()).value.scenes[0].name, "Imported");
  assert.equal((await next.artworkAdapter("artwork").get("map")).size, png.size);
  assert.equal((await next.activateImport("resume")).replayed, true);
  assert.equal((await next.collections()).value.length, 2);
});

test("activation interruption rolls back both active pointer and imported snapshot", async () => {
  for (const point of ["activate-after-snapshot", "activate-after-pointer"]) {
    const { vault, failAt } = harness(); const initial = await vault.initializeEmpty();
    const state = { ...createEmptyEnvelope(now), scenes: [createSceneRecord({}, { id: "new", now })] };
    await vault.stageImport({ state }, { jobId: "import" }); failAt(point);
    assert.equal((await vault.activateImport("import")).ok, false); failAt(null);
    assert.equal((await vault.load()).value.vaultGeneration, initial.value.vaultGeneration);
    assert.equal((await vault.collections()).value.length, 1);
    assert.equal((await vault.activateImport("import")).ok, true);
  }
});

test("unknown fields survive repeated vault saves as inspectable quarantine", async () => {
  const { vault } = harness();
  const state = { ...createEmptyEnvelope(now), newFeature: { chosen: "future" }, scenes: [createSceneRecord({}, { id: "scene", now })] };
  state.scenes[0].futureEffect = { source: "preserve" };
  await vault.stageImport({ state }, { jobId: "unknown" }); await vault.activateImport("unknown");
  const loaded = await vault.load(); assert.equal(loaded.quarantined, 2);
  assert.equal((await vault.save(loaded.value)).ok, true);
  const next = await vault.load(); assert.equal(next.quarantined, 2);
  assert.deepEqual(next.value.quarantine.find((entry) => entry.path === "/newFeature").value, { chosen: "future" });
});

test("future writer versions block writes while preserving raw records", async () => {
  const { vault } = harness(); const initial = await vault.initializeEmpty();
  await vault.database.transaction(["vaultMetadata"], "readwrite", (tx) => requestValue(tx.objectStore("vaultMetadata").put({ generation: initial.generation, minimumReader: 1, minimumWriter: 99 }, "active")));
  assert.equal((await vault.load()).code, "vault-version-incompatible");
  assert.equal((await vault.save(initial.value)).code, "vault-version-incompatible");
  assert.equal((await vault.collections()).value.length, 1);
});

test("referenced backup images cannot be removed after a replacement", async () => {
  const { vault } = harness(); await vault.initializeEmpty();
  const images = vault.artworkAdapter("artwork"); await images.put("old", png);
  let loaded = await vault.load(); await vault.save({ ...loaded.value, scenes: [createSceneRecord({ artworkKey: "old" }, { id: "scene", now })] });
  await images.put("new", png); loaded = await vault.load();
  await vault.save({ ...loaded.value, scenes: [{ ...loaded.value.scenes[0], artworkKey: "new" }] });
  await images.remove("old"); assert.ok(await images.get("old"));
  loaded = await vault.load(); await vault.save(loaded.value);
  await images.remove("old"); assert.equal(await images.get("old"), null);
});
