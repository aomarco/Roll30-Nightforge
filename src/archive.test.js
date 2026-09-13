import assert from "node:assert/strict";
import test from "node:test";
import { zipSync } from "fflate";
import { createArchive, inspectArchive, readArchiveEntries, sha256, validateStateGraph } from "./storage/archive/format.js";
import { createEmptyEnvelope } from "./storage/envelope.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
const now = "2026-09-06T12:00:00.000Z";
const options = { clock: () => now, idFactory: () => "archive-fixture" };
const png = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" });
const fixture = () => ({ ...createEmptyEnvelope(now),
  scenes: [createSceneRecord({ name: "Forêt — 火", artworkKey: "map" }, { id: "scene", now })],
  heroes: [createHeroRecord({ name: "Éowyn", portraitKey: "portrait" }, { id: "hero", now })],
});

test("archive round trip preserves Unicode, state and content-addressed images", async () => {
  const state = fixture(); state.extension = { unknownFutureChoice: [1, "kept"] };
  const packed = await createArchive({ state, assets: [{ key: "map", kind: "artwork", blob: png }, { key: "portrait", kind: "portrait", blob: png }], custom: { note: "inert custom content" } }, options);
  const result = await inspectArchive(packed.blob);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.custom, { note: "inert custom content" });
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].path, result.assets[1].path);
  assert.equal(await sha256(new Uint8Array(await result.assets[0].blob.arrayBuffer())), await sha256(new Uint8Array(await png.arrayBuffer())));
});

test("archive cancellation and missing references never produce a playable silent-loss import", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createArchive({ state: fixture() }, { signal: controller.signal }), { code: "archive-cancelled" });
  const missing = await createArchive({ state: fixture() }, options);
  await assert.rejects(inspectArchive(missing.blob), { code: "archive-reference-invalid" });
  const declared = await createArchive({ state: fixture(), missing: [{ kind: "artwork", key: "map" }, { kind: "portrait", key: "portrait" }] }, options);
  assert.equal((await inspectArchive(declared.blob)).manifest.missing.length, 2);
});

test("archive rejects dangerous paths, compression, damaged entries and duplicate IDs", async () => {
  assert.throws(() => readArchiveEntries(zipSync({ "../state.json": new Uint8Array() }, { level: 0 })), { code: "archive-path-invalid" });
  assert.throws(() => readArchiveEntries(zipSync({ "state.json": new TextEncoder().encode("x".repeat(10000)) })), { code: "archive-compression-unsupported" });
  const packed = await createArchive({ state: createEmptyEnvelope(now) }, options);
  const bytes = new Uint8Array(await packed.blob.arrayBuffer()); bytes[45] ^= 1;
  assert.throws(() => readArchiveEntries(bytes), { code: "archive-crc-invalid" });
  const state = fixture(); state.heroes.push(state.heroes[0]);
  assert.throws(() => validateStateGraph(state), { code: "archive-id-invalid" });
});

test("archive refuses future versions and invalid images before activation", async () => {
  const packed = await createArchive({ state: fixture(), assets: [{ key: "map", kind: "artwork", blob: png }, { key: "portrait", kind: "portrait", blob: png }] }, options);
  await assert.rejects(inspectArchive(packed.blob, { imageDecoder: async () => ({ ok: false, message: "Bad image" }) }), { code: "archive-image-invalid" });
  const entries = Object.fromEntries(readArchiveEntries(new Uint8Array(await packed.blob.arrayBuffer())));
  const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"])); manifest.formatVersion = 999;
  entries["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  await assert.rejects(inspectArchive(new Blob([zipSync(entries, { level: 0 })])), { code: "archive-version-unsupported" });
});

test("recovery evidence archives preserve raw data but cannot replace a campaign automatically", async () => {
  const packed = await createArchive({ recovery: { primary: "{broken", backup: "another broken copy" }, assets: [{ key: "orphan", kind: "artwork", blob: png }] }, options);
  const entries = readArchiveEntries(new Uint8Array(await packed.blob.arrayBuffer()));
  assert.equal(JSON.parse(new TextDecoder().decode(entries.get("recovery.json"))).primary, "{broken");
  await assert.rejects(inspectArchive(packed.blob), { code: "archive-recovery-evidence" });
});
