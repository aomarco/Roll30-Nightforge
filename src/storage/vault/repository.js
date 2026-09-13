import { failure, fromThrown, isQuotaExceededError, success } from "../../application/result.js";
import { createEmptyEnvelope } from "../envelope.js";
import { assetReferences, checkCancelled, sha256, validateJson } from "../archive/format.js";
import { createVaultDatabase, requestValue as request, VAULT_STORES } from "./database.js";
import { assetId, prepareSnapshot, snapshotReferences } from "./snapshot.js";

const compatibility = (metadata) => metadata?.minimumReader > 1 || metadata?.minimumWriter > 1;
const problem = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const get = (tx, store, key) => request(tx.objectStore(store).get(key));
const put = (tx, store, key, value) => request(tx.objectStore(store).put(value, key));
const all = (tx, store) => request(tx.objectStore(store).getAll());

export function createVaultRepository(indexedDB, {
  name, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID(),
  fault = () => undefined, onChange = () => undefined, onVersionChange = () => undefined,
} = {}) {
  const database = createVaultDatabase(indexedDB, name, { onVersionChange });
  const safely = async (operation) => {
    try { return await operation(); }
    catch (error) {
      return fromThrown(error.code || (isQuotaExceededError(error) ? "vault-quota-exceeded" : "vault-operation-failed"),
        error.message || "Nightforge could not access the vault.", error,
        "Your previous committed data is preserved. Export a backup, inspect recovery, or retry.");
    }
  };
  const active = async (tx) => {
    const metadata = await get(tx, "vaultMetadata", "active");
    if (compatibility(metadata)) problem("vault-version-incompatible", "This vault needs a newer Nightforge reader or writer. It has not been changed.");
    return metadata;
  };
  const load = () => safely(() => database.transaction(["vaultMetadata", "campaignSnapshots", "pendingResolutions"], "readonly", async (tx) => {
    const metadata = await active(tx);
    if (!metadata) return success(createEmptyEnvelope(clock()), { source: "empty", classification: "truly-empty", absent: true });
    const snapshot = await get(tx, "campaignSnapshots", metadata.generation);
    if (!snapshot) problem("vault-snapshot-missing", "The active campaign snapshot is missing. Open recovery; no data was cleared.");
    const value = prepareSnapshot(snapshot.state, snapshot.state.savedAt);
    value.pendingResolutions = (await all(tx, "pendingResolutions")).filter((entry) => entry.generation === metadata.generation).map(({ generation, ...entry }) => entry);
    return success({ ...value, vaultGeneration: metadata.generation }, {
      source: "vault", classification: "healthy-primary", revision: value.revision, generation: metadata.generation,
      title: snapshot.title, legacyFingerprint: metadata.legacyFingerprint || null, quarantined: value.quarantine.length,
    });
  }));
  const verifyReferences = async (tx, generation, state, missing = []) => {
    const allowedMissing = new Set(missing.map((entry) => `${entry.kind}:${entry.key}`));
    for (const ref of assetReferences(state)) {
      if (allowedMissing.has(`${ref.kind}:${ref.key}`)) continue;
      const id = assetId(generation, ref.kind, ref.key);
      const blob = await get(tx, "assetBlobs", id);
      const metadata = await get(tx, "assetMetadata", id);
      if (!blob || !metadata || blob.size !== metadata.size) problem("vault-asset-missing", `The image for ${ref.name} is missing. No campaign changes were committed.`);
      if (metadata.status !== "active") await put(tx, "assetMetadata", id, { ...metadata, status: "active" });
    }
  };
  const save = (proposed, { commandId = idFactory(), pending = [] } = {}) => safely(async () => {
    const now = clock();
    const prepared = prepareSnapshot(proposed, now);
    const payloadHash = await sha256(new TextEncoder().encode(JSON.stringify({ proposed, pending })));
    if (prepared.revision >= Number.MAX_SAFE_INTEGER) problem("storage-revision-exhausted", "This campaign cannot safely assign another revision.");
    const result = await database.transaction(VAULT_STORES, "readwrite", async (tx) => {
      const metadata = await active(tx);
      if (!metadata || proposed.vaultGeneration !== metadata.generation) problem("vault-generation-conflict", "The active campaign changed. Reopen it before saving.");
      const key = assetId(metadata.generation, "command", commandId);
      const previous = await get(tx, "commandOutcomes", key);
      if (previous) {
        if (previous.payloadHash !== payloadHash) problem("vault-command-conflict", "This command ID was already used for a different request.");
        return success(previous.state, { revision: previous.state.revision, replayed: true });
      }
      const current = await get(tx, "campaignSnapshots", metadata.generation);
      if (!current || current.state.revision !== proposed.revision) problem("storage-revision-conflict", "The campaign changed before this save. Refresh and retry; no newer data was overwritten.");
      const next = { ...prepared, revision: proposed.revision + 1, savedAt: now };
      next.campaign = { ...next.campaign, sceneIds: next.scenes.map((scene) => scene.id), heroIds: next.heroes.map((hero) => hero.id) };
      await verifyReferences(tx, metadata.generation, next, current.missing);
      await put(tx, "campaignSnapshots", `${metadata.generation}:backup`, { ...current, backup: true });
      fault("save-after-backup");
      await put(tx, "campaignSnapshots", metadata.generation, { ...current, state: next });
      fault("save-after-snapshot");
      for (const resolution of pending) {
        validateJson(resolution);
        if (typeof resolution.id !== "string" || !resolution.id || resolution.id.length > 256) problem("vault-pending-invalid", "A pending resolution needs a stable identifier.");
        await put(tx, "pendingResolutions", assetId(metadata.generation, "pending", resolution.id), { ...resolution, generation: metadata.generation });
      }
      next.pendingResolutions = (await all(tx, "pendingResolutions")).filter((entry) => entry.generation === metadata.generation).map(({ generation, ...entry }) => entry);
      const value = { ...next, vaultGeneration: metadata.generation };
      await put(tx, "commandOutcomes", key, { commandId, payloadHash, state: value });
      fault("save-after-outcome");
      return success(value, { revision: next.revision, commandId });
    });
    onChange();
    return result;
  });
  const stageImport = ({ state, assets = [], title = "Imported campaign", fingerprint = null, missing = [], custom = null, legacyEvidence = null }, { jobId = idFactory(), signal } = {}) => safely(async () => {
    checkCancelled(signal);
    if (typeof jobId !== "string" || !jobId || jobId.length > 256) problem("vault-import-id-invalid", "The import identifier is invalid.");
    const readable = await load(); if (!readable.ok) return readable;
    const prepared = prepareSnapshot(state, clock());
    if (custom) prepared.quarantine.push({ path: "/custom", reason: "unrecognized-content", value: custom });
    const generation = `campaign-${jobId}`;
    prepared.campaign = { ...prepared.campaign, id: generation, title, sceneIds: prepared.scenes.map((scene) => scene.id), heroIds: prepared.heroes.map((hero) => hero.id) };
    const stateHash = await sha256(new TextEncoder().encode(JSON.stringify({ state, custom, title, missing })));
    const descriptors = [];
    const identities = new Set();
    for (const asset of assets) {
      checkCancelled(signal);
      const identity = `${asset.kind}:${asset.key}`;
      if (!["artwork", "portrait"].includes(asset.kind) || typeof asset.key !== "string" || !asset.key || asset.key.length > 512 || identities.has(identity)) problem("vault-asset-invalid", "Imported image identities must be unique and valid.");
      identities.add(identity);
      if (!(asset.blob instanceof Blob)) problem("vault-asset-invalid", "An imported image is not a file.");
      descriptors.push({ kind: asset.kind, key: asset.key, size: asset.blob.size, mime: asset.blob.type, sha256: await sha256(new Uint8Array(await asset.blob.arrayBuffer())) });
    }
    const existing = await database.transaction(["importJobs"], "readonly", (tx) => get(tx, "importJobs", jobId));
    if (existing && (existing.stateHash !== stateHash || existing.fingerprint !== fingerprint || JSON.stringify(existing.assets) !== JSON.stringify(descriptors))) problem("vault-import-conflict", "This import identifier belongs to different files.");
    if (existing?.status === "committed") return success(existing, { replayed: true });
    const job = existing || { id: jobId, generation, status: "staging", state: prepared, stateHash, title, fingerprint, missing, assets: descriptors, createdAt: clock(), legacyEvidence };
    await database.transaction(["importJobs"], "readwrite", (tx) => put(tx, "importJobs", jobId, job));
    fault("import-after-journal");
    for (const [index, asset] of assets.entries()) {
      checkCancelled(signal);
      const id = assetId(generation, asset.kind, asset.key);
      await database.transaction(["assetBlobs", "assetMetadata"], "readwrite", async (tx) => {
        await put(tx, "assetBlobs", id, asset.blob);
        await put(tx, "assetMetadata", id, { ...descriptors[index], id, generation, status: "staged", jobId, createdAt: clock() });
      });
      fault("import-after-asset", index);
    }
    checkCancelled(signal);
    await database.transaction(VAULT_STORES, "readwrite", async (tx) => {
      await verifyReferences(tx, generation, prepared, missing);
      await put(tx, "importJobs", jobId, { ...job, status: "ready" });
    });
    fault("import-ready");
    return success({ ...job, status: "ready" });
  });
  const activateImport = (jobId, { expectedGeneration, expectedRevision } = {}) => safely(async () => {
    const result = await database.transaction(VAULT_STORES, "readwrite", async (tx) => {
      const metadata = await active(tx);
      const job = await get(tx, "importJobs", jobId);
      if (!job) problem("vault-import-missing", "That staged import no longer exists.");
      if (job.status === "committed") return success(job, { replayed: true });
      if (job.status !== "ready") problem("vault-import-incomplete", "This import still needs files. Select the same archive to resume it.");
      if (expectedGeneration !== undefined && (metadata?.generation || null) !== expectedGeneration) problem("vault-generation-conflict", "The campaign changed since the import preview. Review it again.");
      if (expectedRevision !== undefined && metadata) {
        const current = await get(tx, "campaignSnapshots", metadata.generation);
        if (current?.state.revision !== expectedRevision) problem("storage-revision-conflict", "New changes were saved after the import preview. Review it again.");
      }
      await verifyReferences(tx, job.generation, job.state, job.missing);
      await put(tx, "campaignSnapshots", job.generation, { generation: job.generation, title: job.title, state: job.state, missing: job.missing, createdAt: job.createdAt });
      for (const resolution of job.state.pendingResolutions || []) await put(tx, "pendingResolutions", assetId(job.generation, "pending", resolution.id), { ...resolution, generation: job.generation });
      fault("activate-after-snapshot");
      await put(tx, "vaultMetadata", "active", { generation: job.generation, minimumReader: 1, minimumWriter: 1, legacyFingerprint: job.legacyEvidence?.fingerprint || metadata?.legacyFingerprint || null });
      if (job.legacyEvidence) await put(tx, "migrationJobs", job.id, { ...job.legacyEvidence, id: job.id, generation: job.generation, status: "committed" });
      await put(tx, "importJobs", jobId, { ...job, status: "committed" });
      fault("activate-after-pointer");
      return success({ ...job, status: "committed" });
    });
    onChange(); return result;
  });
  const initializeEmpty = () => safely(async () => {
    const existing = await load();
    if (!existing.ok || !existing.absent) return existing;
    const initial = await database.transaction(["importJobs"], "readonly", (tx) => get(tx, "importJobs", "initial"));
    // A restart must resume the exact captured source, including its timestamp.
    const source = initial ? { ...initial.state, campaign: undefined } : createEmptyEnvelope(clock());
    if (initial) {
      delete source.campaign; delete source.quarantine;
    }
    const staged = initial ? success(initial) : await stageImport({ state: source, title: "My campaign" }, { jobId: "initial" });
    if (!staged.ok) return staged;
    if (staged.value.status === "staging") await database.transaction(["importJobs"], "readwrite", (tx) => put(tx, "importJobs", "initial", { ...staged.value, status: "ready" }));
    const activated = await activateImport("initial", { expectedGeneration: null });
    return activated.ok || activated.code === "vault-generation-conflict" ? load() : activated;
  });
  const collections = () => safely(() => database.transaction(["campaignSnapshots"], "readonly", async (tx) => success((await all(tx, "campaignSnapshots")).filter((entry) => !entry.backup).map(({ generation, title, state }) => ({ generation, title, scenes: state.scenes.length, heroes: state.heroes.length, revision: state.revision })))));
  const selectCollection = (generation) => safely(async () => {
    await database.transaction(["vaultMetadata", "campaignSnapshots"], "readwrite", async (tx) => {
      const metadata = await active(tx);
      const selected = await get(tx, "campaignSnapshots", generation);
      if (!selected || selected.backup) problem("vault-campaign-missing", "That campaign is no longer available.");
      await put(tx, "vaultMetadata", "active", { ...metadata, generation, minimumReader: 1, minimumWriter: 1 });
    });
    onChange(); return load();
  });
  const jobs = () => safely(() => database.transaction(["importJobs"], "readonly", async (tx) => success((await all(tx, "importJobs")).map(({ state, assets, legacyEvidence, ...job }) => ({ ...job, imageCount: assets.length })))));
  const discardImport = (jobId) => safely(() => database.transaction(VAULT_STORES, "readwrite", async (tx) => {
    const job = await get(tx, "importJobs", jobId);
    if (!job || job.status === "committed") problem("vault-import-not-discardable", "Only an unfinished import can be discarded.");
    for (const asset of job.assets) {
      const id = assetId(job.generation, asset.kind, asset.key);
      await request(tx.objectStore("assetBlobs").delete(id)); await request(tx.objectStore("assetMetadata").delete(id));
    }
    await request(tx.objectStore("importJobs").delete(jobId)); return success(jobId);
  }));
  const retention = () => safely(() => database.transaction(["campaignSnapshots", "importJobs"], "readonly", async (tx) => {
    const states = [...(await all(tx, "campaignSnapshots")).map((entry) => entry.state), ...(await all(tx, "importJobs")).filter((entry) => entry.status !== "committed").map((entry) => entry.state)];
    const refs = states.flatMap(snapshotReferences);
    return success({ certain: !states.some((state) => state.quarantine?.length), artworkKeys: refs.filter((ref) => ref.kind === "artwork").map((ref) => ref.key), portraitKeys: refs.filter((ref) => ref.kind === "portrait").map((ref) => ref.key) });
  }));
  const artworkAdapter = (kind) => ({
    get: async (key) => {
      const result = await database.transaction(["vaultMetadata", "assetBlobs"], "readonly", async (tx) => {
        const metadata = await active(tx); return metadata ? get(tx, "assetBlobs", assetId(metadata.generation, kind, key)) : null;
      });
      return result || null;
    },
    put: async (key, blob) => {
      const hash = await sha256(new Uint8Array(await blob.arrayBuffer()));
      return database.transaction(["vaultMetadata", "assetBlobs", "assetMetadata"], "readwrite", async (tx) => {
        const metadata = await active(tx);
        if (!metadata) problem("vault-not-ready", "Open a campaign before uploading an image.");
        const id = assetId(metadata.generation, kind, key);
        if (await get(tx, "assetMetadata", id)) problem("vault-asset-collision", "This image identifier already exists. Retry the upload.");
        await put(tx, "assetBlobs", id, blob);
        await put(tx, "assetMetadata", id, { id, generation: metadata.generation, kind, key, size: blob.size, mime: blob.type, sha256: hash, status: "staged", createdAt: clock() });
        return key;
      });
    },
    remove: (key) => database.transaction(VAULT_STORES, "readwrite", async (tx) => {
      const metadata = await active(tx); if (!metadata) return;
      const snapshots = (await all(tx, "campaignSnapshots")).filter((entry) => entry.generation === metadata.generation);
      const imports = (await all(tx, "importJobs")).filter((entry) => entry.generation === metadata.generation && entry.status !== "committed");
      if ([...snapshots, ...imports].some((entry) => entry.state.quarantine?.length)) return;
      if ([...snapshots, ...imports].some((entry) => snapshotReferences(entry).some((ref) => ref.kind === kind && ref.key === key))) return;
      const id = assetId(metadata.generation, kind, key);
      await request(tx.objectStore("assetBlobs").delete(id)); await request(tx.objectStore("assetMetadata").delete(id));
    }),
    keys: () => database.transaction(["vaultMetadata", "assetMetadata"], "readonly", async (tx) => {
      const metadata = await active(tx);
      return (await all(tx, "assetMetadata")).filter((entry) => entry.generation === metadata?.generation && entry.kind === kind).map((entry) => entry.key);
    }),
  });
  const collectGarbage = () => safely(() => database.transaction(VAULT_STORES, "readwrite", async (tx) => {
    await active(tx);
    const snapshots = await all(tx, "campaignSnapshots");
    const imports = (await all(tx, "importJobs")).filter((entry) => entry.status !== "committed");
    if ([...snapshots, ...imports].some((entry) => entry.state.quarantine?.length)) return success([], { deferred: true });
    const retained = new Set([...snapshots, ...imports].flatMap((entry) => snapshotReferences(entry).map((ref) => assetId(entry.generation, ref.kind, ref.key))));
    // Uncommitted uploads are retained until their writer explicitly abandons
    // them; neither elapsed wall time nor startup implies their owner is dead.
    const candidates = (await all(tx, "assetMetadata")).filter((entry) => entry.status !== "staged" && !retained.has(entry.id));
    for (const entry of candidates) {
      await request(tx.objectStore("assetBlobs").delete(entry.id));
      await request(tx.objectStore("assetMetadata").delete(entry.id));
    }
    fault("gc-before-commit"); return success(candidates.map((entry) => entry.key));
  }));
  const evidence = () => safely(() => database.transaction(VAULT_STORES, "readonly", async (tx) => success({
    metadata: await get(tx, "vaultMetadata", "active"), snapshots: await all(tx, "campaignSnapshots"),
    imports: await all(tx, "importJobs"), migrations: await all(tx, "migrationJobs"),
    pending: await all(tx, "pendingResolutions"), outcomes: await all(tx, "commandOutcomes"),
    assetMetadata: await all(tx, "assetMetadata"),
    assets: await Promise.all((await all(tx, "assetMetadata")).map(async (entry) => ({ ...entry, blob: await get(tx, "assetBlobs", entry.id) }))),
  })));
  const backup = () => safely(() => database.transaction(["vaultMetadata", "campaignSnapshots"], "readonly", async (tx) => {
    const metadata = await active(tx);
    const snapshot = metadata && await get(tx, "campaignSnapshots", `${metadata.generation}:backup`);
    return snapshot ? success(snapshot) : failure("vault-backup-missing", "No previous saved revision is available yet.");
  }));
  return { load, save, initializeEmpty, stageImport, activateImport, collections, selectCollection, jobs, discardImport, retention, artworkAdapter, collectGarbage, evidence, backup, database };
}
