import { failure, fromThrown, success } from "./result.js";
import { createArchive, inspectArchive, assetReferences, sha256, checkCancelled } from "../storage/archive/format.js";
import { remapImportedState } from "../storage/archive/remap.js";
import { createEmptyEnvelope, inspectEnvelope } from "../storage/envelope.js";
import { prepareSnapshot } from "../storage/vault/snapshot.js";

const signature = (loaded) => JSON.stringify([loaded.value.vaultGeneration || "legacy", loaded.value.revision, loaded.value.savedAt]);
const encoded = (value) => new TextEncoder().encode(JSON.stringify(value));

export function createBackupService({
  stateRepository, legacyRepository, artworkRepository, portraitRepository,
  legacyArtworkRepository, legacyPortraitRepository, vault, adoptVault,
  withWriter = (operation) => operation(), imageDecoder,
  clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID(),
}) {
  const previews = new Map(), checkpoints = new Map();
  const safe = async (operation) => {
    try { return await operation(); }
    catch (error) { return fromThrown(error.code || "backup-operation-failed", error.message || "The backup operation failed.", error, "The active campaign was preserved. Review the message and retry."); }
  };
  const collectAssets = async (state, { legacy = false, signal, onProgress = () => {} } = {}) => {
    const refs = assetReferences(state), assets = [], missing = [];
    for (const [index, ref] of refs.entries()) {
      checkCancelled(signal);
      const repository = ref.kind === "artwork" ? legacy ? legacyArtworkRepository : artworkRepository : legacy ? legacyPortraitRepository : portraitRepository;
      const result = await repository.get(ref.key);
      if (!result.ok || !(result.value instanceof Blob)) missing.push({ ...ref, reason: result.message || "Image data is missing" });
      else assets.push({ ...ref, blob: result.value });
      onProgress({ stage: "reading", completed: index + 1, total: refs.length });
    }
    return { assets, missing };
  };
  const readCurrent = async (options = {}) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const loaded = await stateRepository.load();
      if (!loaded.ok) return loaded;
      if (loaded.readOnly) return failure("backup-recovery-required", "This data needs recovery. Export preserved evidence instead of a playable archive.");
      let state = loaded.value;
      if (!state.vaultGeneration) {
        const raw = await legacyRepository.evidence();
        if (!raw.ok) return raw;
        const selected = raw.value[loaded.source];
        if (selected && inspectEnvelope(selected).ok) { const { checksum, ...source } = JSON.parse(selected); state = source; }
      }
      const images = await collectAssets(state, options);
      const after = await stateRepository.load();
      if (after.ok && signature(after) === signature(loaded)) return success({ state, ...images, signature: signature(loaded) });
    }
    return failure("backup-state-busy", "The campaign kept changing during export. Pause edits briefly and retry.");
  };
  const exportCurrent = (options = {}) => safe(() => withWriter(async () => {
    const source = await readCurrent(options); if (!source.ok) return source;
    const archive = await createArchive(source.value, { ...options, clock, idFactory });
    checkpoints.clear();
    checkpoints.set(archive.manifest.archiveId, { signature: source.value.signature, downloaded: false, ...source.value });
    return success({ ...archive, filename: `Nightforge-${archive.manifest.createdAt.slice(0, 10)}.nightforge`, degraded: source.value.missing.length > 0 });
  }));
  const markDownloaded = (archiveId) => {
    const checkpoint = checkpoints.get(archiveId);
    if (!checkpoint) return failure("backup-checkpoint-missing", "Create a fresh backup before continuing.");
    checkpoint.downloaded = true; return success(archiveId);
  };
  const inspect = (file, options = {}) => safe(async () => {
    const archive = await inspectArchive(file, { ...options, imageDecoder });
    const current = await stateRepository.load(); if (!current.ok) return current;
    const id = idFactory();
    previews.clear();
    previews.set(id, { archive, signature: signature(current), current: current.value });
    const prepared = prepareSnapshot(archive.state, clock());
    return success({ id, filename: file.name || "Nightforge archive", counts: archive.manifest.counts,
      createdAt: archive.manifest.createdAt, missing: archive.manifest.missing, quarantined: prepared.quarantine.length,
      scenes: archive.state.scenes.map(({ id, name }) => ({ id, name })), heroes: archive.state.heroes.map(({ id, name }) => ({ id, name })),
      collisions: archive.state.scenes.filter((scene) => current.value.scenes.some((entry) => entry.id === scene.id)).length + archive.state.heroes.filter((hero) => current.value.heroes.some((entry) => entry.id === hero.id)).length,
      fingerprint: archive.fingerprint, storageBytes: archive.assets.reduce((sum, asset) => sum + asset.blob.size, 0) + archive.bytes,
    });
  });
  const importPreview = (id, { mode = "new", checkpointId, title = "Imported campaign", signal } = {}) => safe(() => withWriter(async () => {
    const preview = previews.get(id);
    if (!preview) return failure("backup-preview-expired", "Select and inspect the archive again before importing.");
    const current = await stateRepository.load(); if (!current.ok) return current;
    if (signature(current) !== preview.signature) return failure("backup-preview-stale", "The campaign changed after this preview. Inspect the archive again.");
    if (!["new", "merge", "replace"].includes(mode)) return failure("backup-import-mode", "Choose a supported import mode.");
    if (mode !== "new") {
      const checkpoint = checkpoints.get(checkpointId);
      if (!checkpoint?.downloaded || checkpoint.signature !== preview.signature) return failure("backup-checkpoint-required", "Download a current backup before merging or replacing this campaign.");
    }
    let { state, assets, custom, fingerprint, manifest } = preview.archive;
    let missing = manifest.missing;
    if (mode === "merge") {
      let sequence = 0;
      const mergePrefix = (await sha256(encoded([fingerprint, preview.signature]))).slice(0, 24);
      const copied = remapImportedState(state, assets, missing, () => `${mergePrefix}-${++sequence}`);
      const existing = await readCurrent({ signal }); if (!existing.ok) return existing;
      state = { ...existing.value.state, scenes: [...existing.value.state.scenes, ...copied.state.scenes], heroes: [...existing.value.state.heroes, ...copied.state.heroes], pendingResolutions: [...(existing.value.state.pendingResolutions || []), ...(copied.state.pendingResolutions || [])], quarantine: [...(existing.value.state.quarantine || []), ...(copied.state.quarantine || [])] };
      assets = [...existing.value.assets, ...copied.assets]; missing = [...existing.value.missing, ...copied.missing];
    }
    checkCancelled(signal);
    const jobId = `${mode}-${await sha256(encoded([fingerprint, mode === "new" ? null : preview.signature, title]))}`;
    const staged = await vault.stageImport({ state, assets, missing, custom, fingerprint, title }, { jobId, signal });
    if (!staged.ok) return staged;
    checkCancelled(signal);
    const activated = await vault.activateImport(jobId, current.value.vaultGeneration ? { expectedGeneration: current.value.vaultGeneration, expectedRevision: current.value.revision } : { expectedGeneration: null });
    if (!activated.ok) return activated;
    if (activated.replayed) {
      const selected = await vault.selectCollection(activated.value.generation); if (!selected.ok) return selected;
    }
    await adoptVault(); previews.delete(id); return success({ generation: activated.value.generation, replayed: activated.replayed || false });
  }));
  const exportEvidence = (options = {}) => safe(() => withWriter(async () => {
    const raw = await legacyRepository.evidence();
    const vaultEvidence = await vault.evidence();
    const assets = [];
    for (const [kind, repository] of [["artwork", legacyArtworkRepository], ["portrait", legacyPortraitRepository]]) {
      const keys = await repository.keys();
      if (!keys.ok) continue;
      for (const key of keys.value) {
        checkCancelled(options.signal);
        const result = await repository.get(key);
        if (result.ok && result.value instanceof Blob) assets.push({ kind, key: JSON.stringify(["legacy", kind, key]), blob: result.value });
      }
    }
    const evidence = vaultEvidence.ok ? { ...vaultEvidence.value } : { error: vaultEvidence.message };
    if (evidence.assets) {
      evidence.assets = evidence.assets.map(({ blob, ...record }) => {
        const archiveKey = JSON.stringify(["vault", record.generation, record.kind, record.key]);
        if (blob instanceof Blob) assets.push({ kind: record.kind, key: archiveKey, blob });
        return { ...record, archiveKey, available: blob instanceof Blob };
      });
    }
    const archive = await createArchive({ recovery: { legacy: raw.ok ? raw.value : { error: raw.message }, vault: evidence }, assets }, { ...options, clock, idFactory });
    return success({ ...archive, filename: `Nightforge-recovery-${archive.manifest.createdAt.slice(0, 10)}.nightforge` });
  }));
  const migrate = (checkpointId, options = {}) => safe(() => withWriter(async () => {
    const checkpoint = checkpoints.get(checkpointId);
    const current = await stateRepository.load(); if (!current.ok) return current;
    if (current.value.vaultGeneration) return success(current.value, { alreadyMigrated: true });
    if (!checkpoint?.downloaded || checkpoint.signature !== signature(current)) return failure("backup-checkpoint-required", "Download a current backup before moving this campaign into the vault.");
    if (checkpoint.missing.length) return failure("migration-assets-missing", "Restore the missing images before migration, or import the explicitly degraded archive as a separate campaign.");
    const raw = await legacyRepository.evidence(); if (!raw.ok) return raw;
    const fingerprint = await sha256(encoded(raw.value));
    const jobId = `migration-${fingerprint}`;
    const staged = await vault.stageImport({ ...checkpoint, fingerprint, title: "My campaign", legacyEvidence: { ...raw.value, fingerprint, checkpointId } }, { ...options, jobId });
    if (!staged.ok) return staged;
    const latest = await legacyRepository.evidence();
    if (!latest.ok || await sha256(encoded(latest.value)) !== fingerprint) return failure("migration-source-changed", "The older save changed during migration. Export the latest state and retry; both copies are preserved.");
    const activated = await vault.activateImport(jobId, { expectedGeneration: null });
    if (!activated.ok) return activated;
    await adoptVault(); return success({ generation: activated.value.generation });
  }));
  const startClean = (title = "New campaign") => safe(() => withWriter(async () => {
    const staged = await vault.stageImport({ state: createEmptyEnvelope(clock()), title }); if (!staged.ok) return staged;
    const activated = await vault.activateImport(staged.value.id); if (!activated.ok) return activated;
    await adoptVault(); return success({ generation: activated.value.generation });
  }));
  const restoreBackup = () => safe(() => withWriter(async () => {
    const current = await stateRepository.load(); if (!current.ok) return current;
    let state, images;
    if (current.value.vaultGeneration) {
      const backup = await vault.backup(); if (!backup.ok) return backup;
      state = backup.value.state; images = await collectAssets(state);
    } else {
      const raw = await legacyRepository.evidence(); if (!raw.ok) return raw;
      const inspected = inspectEnvelope(raw.value.backup); if (!inspected.ok) return inspected;
      const { checksum, ...source } = JSON.parse(raw.value.backup); state = source;
      images = await collectAssets(state, { legacy: true });
    }
    if (images.missing.length) return failure("backup-assets-missing", "The previous save has missing images. Export its recovery evidence before choosing an incomplete restore.");
    const staged = await vault.stageImport({ state, ...images, title: "Recovered campaign" }); if (!staged.ok) return staged;
    const activated = await vault.activateImport(staged.value.id); if (!activated.ok) return activated;
    await adoptVault(); return success({ generation: activated.value.generation });
  }));
  const status = () => safe(async () => {
    const [current, collections, jobs, legacy] = await Promise.all([stateRepository.load(), vault.collections(), vault.jobs(), legacyRepository.evidence()]);
    let legacyChanged = false;
    if (current.ok && current.legacyFingerprint && legacy.ok) legacyChanged = await sha256(encoded(legacy.value)) !== current.legacyFingerprint;
    return success({ current, collections: collections.ok ? collections.value : [], jobs: jobs.ok ? jobs.value : [], legacyChanged });
  });
  return { exportCurrent, markDownloaded, inspect, importPreview, exportEvidence, migrate, startClean, restoreBackup, status,
    discardImport: (jobId) => withWriter(() => vault.discardImport(jobId)),
    selectCollection: (generation) => withWriter(async () => { const result = await vault.selectCollection(generation); if (result.ok) await adoptVault(); return result; }),
  };
}
