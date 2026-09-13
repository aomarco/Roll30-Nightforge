import { zipSync } from "fflate";

export const ARCHIVE_VERSION = 1;
export const ARCHIVE_LIMITS = Object.freeze({
  bytes: 256 * 1024 * 1024, entries: 10_000, jsonBytes: 16 * 1024 * 1024,
  assetBytes: 25 * 1024 * 1024, depth: 64, nodes: 500_000,
});
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const digestPattern = /^[a-f0-9]{64}$/;
const mimeExtensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };

const workerOperation = (data, signal) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const finish = (operation, value) => { signal?.removeEventListener("abort", cancel); worker.terminate(); operation(value); };
  const cancel = () => finish(reject, new ArchiveError("archive-cancelled", "The operation was cancelled. Active data was not replaced."));
  worker.onmessage = ({ data }) => data.ok ? finish(resolve, data.value) : finish(reject, new ArchiveError(data.code, data.message));
  worker.onerror = () => finish(reject, new ArchiveError("archive-worker-failed", "The archive worker could not finish. Retry with more free memory."));
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel(); else worker.postMessage(data);
});

export class ArchiveError extends Error {
  constructor(code, message) { super(message); this.name = "ArchiveError"; this.code = code; }
}
const refuse = (code, message) => { throw new ArchiveError(code, message); };
export const checkCancelled = (signal) => { if (signal?.aborted) refuse("archive-cancelled", "The operation was cancelled. Active data was not replaced."); };
export async function sha256(bytes) {
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function validateJson(value) {
  let nodes = 0;
  const visit = (entry, depth) => {
    if (++nodes > ARCHIVE_LIMITS.nodes || depth > ARCHIVE_LIMITS.depth) refuse("archive-structure-limit", "The archive's data is too deeply nested or contains too many values.");
    if (typeof entry === "number" && !Number.isFinite(entry)) refuse("archive-number-invalid", "Archive numbers must be finite.");
    if (entry === null || ["string", "number", "boolean"].includes(typeof entry)) return;
    if (typeof entry !== "object") refuse("archive-value-invalid", "The archive contains a value that cannot be stored as JSON.");
    for (const [key, child] of Object.entries(entry)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) refuse("archive-key-invalid", "The archive contains an unsafe object key.");
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return value;
}

const uniqueRecords = (records, label) => {
  if (!Array.isArray(records) || records.length > 5000) refuse("archive-records-invalid", `${label} must be a bounded collection.`);
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim() || record.id.length > 256 || ids.has(record.id)) {
      refuse("archive-id-invalid", `${label} contains a missing, oversized, or duplicate identifier.`);
    }
    ids.add(record.id);
  }
  return ids;
};

export function validateStateGraph(state) {
  validateJson(state);
  if (state?.schemaVersion !== 1 || !Number.isSafeInteger(state?.revision) || state.revision < 0) refuse("archive-state-version", "This archive requires a different state reader. Its contents have been preserved.");
  const sceneIds = uniqueRecords(state.scenes, "Scenes");
  uniqueRecords(state.heroes, "Heroes");
  uniqueRecords(state.rollLog || [], "Roll log");
  uniqueRecords(state.commandOutcomes || [], "Command outcomes");
  uniqueRecords(state.pendingResolutions || [], "Pending resolutions");
  if (state.lastActiveSceneId && !sceneIds.has(state.lastActiveSceneId)) refuse("archive-reference-invalid", "The active Scene reference is missing.");
  for (const scene of state.scenes) {
    if (!["battle", "play"].includes(scene.kind)) refuse("archive-scene-invalid", "The archive contains an unsupported Scene kind.");
    const tokenIds = uniqueRecords(scene.tokens || [], `Tokens in ${scene.name || scene.id}`);
    uniqueRecords(scene.chests || [], "Chests");
    uniqueRecords(scene.walls || [], "Walls");
    if (scene.encounter) {
      if (!["active", "complete"].includes(scene.encounter.status)) refuse("archive-encounter-invalid", "The archive contains an unsupported encounter state.");
      for (const id of scene.encounter.initiativeOrder || []) if (!tokenIds.has(id)) refuse("archive-reference-invalid", "An initiative entry refers to a missing token.");
      uniqueRecords(scene.encounter.battleItems || [], "Battle items");
      uniqueRecords(scene.encounter.pendingResolutions || [], "Pending resolutions in encounter");
    }
  }
  return state;
}

export function assetReferences(state) {
  const refs = new Map();
  for (const [records, field, kind] of [[state.scenes, "artworkKey", "artwork"], [state.heroes, "portraitKey", "portrait"]]) {
    for (const record of records || []) if (record[field]) {
      if (typeof record[field] !== "string" || record[field].length > 512) refuse("archive-asset-reference", "An image has an invalid storage reference.");
      refs.set(`${kind}:${record[field]}`, { kind, key: record[field], name: record.name || record.id });
    }
  }
  return [...refs.values()];
}

const jsonBytes = (value) => {
  validateJson(value);
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > ARCHIVE_LIMITS.jsonBytes) refuse("archive-json-limit", "This archive's structured data exceeds 16 MiB.");
  return bytes;
};
const readJson = (bytes, label) => {
  if (!bytes || bytes.length > ARCHIVE_LIMITS.jsonBytes) refuse("archive-json-limit", `${label} is missing or exceeds 16 MiB.`);
  try { return validateJson(JSON.parse(decoder.decode(bytes))); }
  catch (error) { if (error instanceof ArchiveError) throw error; refuse("archive-json-invalid", `${label} is not valid UTF-8 JSON.`); }
};

/** Version 1 uses stored ZIP entries. Reject compression before allocation: a
 * forged expanded-size header can never trick us into inflating a ZIP bomb. */
export function readArchiveEntries(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > ARCHIVE_LIMITS.bytes) refuse("archive-size-invalid", "Choose a .nightforge archive no larger than 256 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset) => view.getUint16(offset, true), u32 = (offset) => view.getUint32(offset, true);
  const end = bytes.length - 22;
  if (u32(end) !== 0x06054b50 || u16(end + 20) !== 0 || u16(end + 4) || u16(end + 6)) refuse("archive-container-invalid", "This is not a supported single-volume Nightforge ZIP archive.");
  const count = u16(end + 10), centralSize = u32(end + 12), central = u32(end + 16);
  if (count !== u16(end + 8) || count > ARCHIVE_LIMITS.entries || central + centralSize !== end) refuse("archive-directory-invalid", "The archive directory is inconsistent or too large.");
  const entries = new Map(), ranges = [];
  let cursor = central, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) refuse("archive-directory-invalid", "The archive directory is truncated.");
    const flags = u16(cursor + 8), method = u16(cursor + 10), size = u32(cursor + 20), original = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32), offset = u32(cursor + 42);
    if (method !== 0 || (flags & ~0x0800) || size !== original) refuse("archive-compression-unsupported", "Version 1 archives use uncompressed ZIP entries. Export again from Nightforge rather than recompressing the file.");
    if (cursor + 46 + nameLength + extraLength + commentLength > end || offset + 30 > central) refuse("archive-entry-invalid", "The archive contains an invalid file offset.");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!/^(?:manifest\.json|state\.json|recovery\.json|content\/custom\.json|assets\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif|svg|bin))$/.test(name) || entries.has(name)) refuse("archive-path-invalid", "The archive contains an unsafe, unsupported, or duplicate file path.");
    if (u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method || u32(offset + 18) !== size || u32(offset + 22) !== original || u32(offset + 14) !== u32(cursor + 16)) refuse("archive-entry-invalid", "A file header does not match the archive directory.");
    const localNameLength = u16(offset + 26), localExtra = u16(offset + 28), start = offset + 30 + localNameLength + localExtra;
    if (start + size > central || localNameLength !== nameLength || decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)) !== name) refuse("archive-entry-invalid", "The archive contains overlapping or mismatched files.");
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== u32(cursor + 16)) refuse("archive-crc-invalid", `The file ${name} is damaged.`);
    total += size;
    if (total > ARCHIVE_LIMITS.bytes || (name.endsWith(".json") && size > ARCHIVE_LIMITS.jsonBytes) || (name.startsWith("assets/") && size > ARCHIVE_LIMITS.assetBytes)) refuse("archive-size-invalid", "An archive entry exceeds the supported size.");
    entries.set(name, data); ranges.push([offset, start + size]);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let position = 0;
  for (const [start, end] of ranges) { if (start !== position) refuse("archive-entry-invalid", "The archive contains overlapping files or hidden data."); position = end; }
  if (cursor !== end || position !== central) refuse("archive-directory-invalid", "The archive directory does not describe all file data.");
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export async function createArchive({ state, assets = [], missing = [], recovery = null, custom = null }, { signal, onProgress = () => undefined, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID() } = {}) {
  checkCancelled(signal);
  if (!recovery) validateStateGraph(state);
  const files = Object.create(null);
  const stateBytes = jsonBytes(recovery || state);
  const statePath = recovery ? "recovery.json" : "state.json";
  files[statePath] = stateBytes;
  let bytes = stateBytes.length;
  const imageRecords = [], identities = new Set();
  for (const [index, asset] of assets.entries()) {
    checkCancelled(signal);
    if (!["artwork", "portrait"].includes(asset.kind) || typeof asset.key !== "string" || !asset.key || identities.has(`${asset.kind}:${asset.key}`)) refuse("archive-asset-invalid", "An image has an invalid or duplicate identity.");
    identities.add(`${asset.kind}:${asset.key}`);
    if (!(asset.blob instanceof Blob) || !asset.blob.size || asset.blob.size > ARCHIVE_LIMITS.assetBytes) refuse("archive-asset-size", "An image is empty or exceeds the supported archive size.");
    const extension = mimeExtensions[asset.blob.type] || (recovery ? "bin" : null);
    if (!extension) refuse("archive-image-type", `The image ${asset.key} has an unsupported format (${asset.blob.type || "unknown"}).`);
    const data = new Uint8Array(await asset.blob.arrayBuffer());
    const hash = await sha256(data), path = `assets/${hash}.${extension}`;
    if (!files[path]) { files[path] = data; bytes += data.length; }
    if (bytes > ARCHIVE_LIMITS.bytes - ARCHIVE_LIMITS.jsonBytes) refuse("archive-size-invalid", "These files exceed the 256 MiB archive limit. Export a smaller collection.");
    imageRecords.push({ kind: asset.kind, key: asset.key, path, sha256: hash, size: data.length, mime: asset.blob.type });
    onProgress({ stage: "images", completed: index + 1, total: assets.length, bytes });
  }
  let customHash = null;
  if (custom !== null) { files["content/custom.json"] = jsonBytes(custom); customHash = await sha256(files["content/custom.json"]); }
  const manifest = {
    format: "nightforge", formatVersion: ARCHIVE_VERSION, minimumReader: 1,
    creator: { app: "Nightforge", version: "1.0.0", archiveWriter: 1 },
    requiredCapabilities: ["srd-5.1-2014", "stored-zip-v1"],
    generation: state?.vaultGeneration || null, revision: state?.revision ?? null,
    archiveId: idFactory(), createdAt: clock(), type: recovery ? "recovery" : "campaign",
    statePath, stateSha256: await sha256(stateBytes), customHash,
    schemaVersion: state?.schemaVersion || null,
    rules: { edition: "2014", source: "SRD 5.1" },
    counts: { scenes: state?.scenes?.length || 0, heroes: state?.heroes?.length || 0, images: imageRecords.length },
    assets: imageRecords, missing,
  };
  files["manifest.json"] = jsonBytes(manifest);
  checkCancelled(signal);
  onProgress({ stage: "packing", completed: assets.length, total: assets.length, bytes });
  const packed = bytes >= 8 * 1024 * 1024 && typeof Worker !== "undefined"
    ? await workerOperation({ operation: "pack", files }, signal) : zipSync(files, { level: 0 });
  if (packed.length > ARCHIVE_LIMITS.bytes) refuse("archive-size-invalid", "The resulting archive exceeds 256 MiB.");
  checkCancelled(signal);
  return { blob: new Blob([packed], { type: "application/zip" }), manifest };
}

export async function inspectArchive(file, { signal, onProgress = () => undefined, imageDecoder } = {}) {
  checkCancelled(signal);
  if (!(file instanceof Blob) || file.size > ARCHIVE_LIMITS.bytes || (file.name && !file.name.toLowerCase().endsWith(".nightforge"))) refuse("archive-file-invalid", "Choose a .nightforge archive no larger than 256 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = bytes.length >= 8 * 1024 * 1024 && typeof Worker !== "undefined"
    ? new Map(await workerOperation({ operation: "inspect", bytes }, signal)) : readArchiveEntries(bytes);
  const manifest = readJson(entries.get("manifest.json"), "manifest.json");
  if (manifest.format !== "nightforge" || manifest.formatVersion !== ARCHIVE_VERSION || manifest.minimumReader !== 1) refuse("archive-version-unsupported", "This archive requires a different Nightforge version. No files were changed.");
  if (manifest.type !== "campaign") refuse("archive-recovery-evidence", "This file contains preserved recovery evidence. It cannot replace a playable campaign automatically.");
  if (manifest.schemaVersion !== 1 || manifest.rules?.edition !== "2014" || manifest.rules?.source !== "SRD 5.1" || (manifest.requiredCapabilities || []).some((value) => !["srd-5.1-2014", "stored-zip-v1"].includes(value))) refuse("archive-capability-unsupported", "This archive requires content or reader capabilities that this build does not support.");
  if (typeof manifest.archiveId !== "string" || !manifest.archiveId || manifest.archiveId.length > 256 || manifest.statePath !== "state.json" || !digestPattern.test(manifest.stateSha256)) refuse("archive-manifest-invalid", "The archive manifest has invalid identity or state fields.");
  const stateBytes = entries.get("state.json");
  if (!stateBytes || await sha256(stateBytes) !== manifest.stateSha256) refuse("archive-hash-invalid", "The campaign data does not match its recorded hash.");
  const state = validateStateGraph(readJson(stateBytes, "state.json"));
  if (!Array.isArray(manifest.assets) || !Array.isArray(manifest.missing)) refuse("archive-manifest-invalid", "The image manifest is incomplete.");
  if (manifest.counts?.scenes !== state.scenes.length || manifest.counts?.heroes !== state.heroes.length || manifest.counts?.images !== manifest.assets.length) refuse("archive-count-invalid", "The record counts do not match the archive contents.");
  const assets = [], identities = new Set(), expectedPaths = new Set(["manifest.json", "state.json"]);
  for (const [index, entry] of manifest.assets.entries()) {
    checkCancelled(signal);
    const identity = `${entry.kind}:${entry.key}`;
    if (!["artwork", "portrait"].includes(entry.kind) || typeof entry.key !== "string" || !entry.key || entry.key.length > 512 || identities.has(identity)) refuse("archive-asset-invalid", "The image manifest contains duplicate or invalid references.");
    identities.add(identity);
    if (!digestPattern.test(entry.sha256) || !mimeExtensions[entry.mime] || entry.path !== `assets/${entry.sha256}.${mimeExtensions[entry.mime]}`) refuse("archive-asset-invalid", "An image path, type, or hash is invalid.");
    const data = entries.get(entry.path);
    if (!data || data.length !== entry.size || await sha256(data) !== entry.sha256) refuse("archive-hash-invalid", `The image ${entry.key} is missing or damaged.`);
    const blob = new Blob([data], { type: entry.mime });
    if (entry.mime === "image/svg+xml") {
      // Images remain images: reject active markup and external restoration
      // dependencies before the browser ever decodes imported SVG content.
      const svg = decoder.decode(data);
      if (/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|use)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(|@import/i.test(svg)) refuse("archive-image-unsafe", "An SVG image contains active content or external references. Use a self-contained image.");
    }
    if (imageDecoder) {
      const decoded = await imageDecoder(blob, entry.kind);
      if (!decoded.ok) refuse("archive-image-invalid", decoded.message);
    }
    assets.push({ ...entry, blob }); expectedPaths.add(entry.path);
    onProgress({ stage: "validating", completed: index + 1, total: manifest.assets.length });
  }
  const missing = new Set();
  for (const entry of manifest.missing) {
    if (!["artwork", "portrait"].includes(entry?.kind) || typeof entry?.key !== "string" || !entry.key) refuse("archive-missing-invalid", "A missing-image declaration is invalid.");
    const id = `${entry.kind}:${entry.key}`;
    if (identities.has(id) || missing.has(id)) refuse("archive-missing-invalid", "An image is declared more than once.");
    missing.add(id);
  }
  for (const ref of assetReferences(state)) if (!identities.has(`${ref.kind}:${ref.key}`) && !missing.has(`${ref.kind}:${ref.key}`)) refuse("archive-reference-invalid", `No image record accounts for ${ref.name}.`);
  let custom = null;
  if (manifest.customHash !== null) {
    const data = entries.get("content/custom.json");
    if (!digestPattern.test(manifest.customHash) || !data || await sha256(data) !== manifest.customHash) refuse("archive-hash-invalid", "Custom content is missing or damaged.");
    custom = readJson(data, "content/custom.json"); expectedPaths.add("content/custom.json");
  }
  for (const path of entries.keys()) if (!expectedPaths.has(path)) refuse("archive-unlisted-file", "The archive contains a file missing from its manifest.");
  checkCancelled(signal);
  return { state, assets, manifest, custom, fingerprint: await sha256(bytes), bytes: bytes.length };
}
