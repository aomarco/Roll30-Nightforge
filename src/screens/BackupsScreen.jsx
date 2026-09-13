import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Database, FileCheck2, RefreshCw, ShieldCheck, Undo2, X } from "lucide-react";
import "../styles/backups.css";

const sizeLabel = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export default function BackupsScreen({ service, browser = window }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [download, setDownload] = useState(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [checkpointId, setCheckpointId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("new");
  const [title, setTitle] = useState("Imported campaign");
  const [storage, setStorage] = useState(null);
  const [protectedStorage, setProtectedStorage] = useState(null);
  const controller = useRef(null);
  const mounted = useRef(true);
  const previewRef = useRef(null);
  const current = status?.current;
  const inVault = Boolean(current?.value?.vaultGeneration);
  const readOnly = !current?.ok || current?.readOnly;

  const refresh = async () => {
    if (!service) return;
    const result = await service.status();
    if (mounted.current) {
      if (result.ok) setStatus(result.value); else setError(result);
    }
    try {
      const estimate = await browser.navigator?.storage?.estimate?.();
      if (mounted.current) setStorage(estimate || null);
    } catch { /* An estimate is optional; saving never depends on it. */ }
  };
  useEffect(() => {
    mounted.current = true; refresh();
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [service]);

  const run = async (operation, message) => {
    if (controller.current) return null;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setProgress(null); setError(null); setNotice("");
    try {
      const result = await operation({ signal: abort.signal, onProgress: (value) => { if (mounted.current) setProgress(value); } });
      if (!mounted.current) return result;
      if (!result?.ok) setError(result || { message: "This operation is unavailable." });
      else if (message) setNotice(message);
      await refresh(); return result;
    } catch (caught) {
      if (mounted.current) setError({ message: caught.message || "The operation did not complete. Your previous data is preserved." });
      return null;
    } finally {
      controller.current = null;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  };
  const exportBackup = async (evidence = false) => {
    const result = await run((options) => evidence ? service.exportEvidence(options) : service.exportCurrent(options));
    if (result?.ok && mounted.current) {
      setDownload({ ...result.value, evidence }); setDownloadRequested(false);
      setNotice(evidence ? "Recovery evidence is ready. It contains the preserved records and available images." : "Your portable backup is ready to save.");
    }
  };
  const saveDownload = async () => {
    if (!download) return;
    try {
      if (typeof browser.showSaveFilePicker === "function") {
        const handle = await browser.showSaveFilePicker({ suggestedName: download.filename, types: [{ description: "Nightforge backup", accept: { "application/zip": [".nightforge"] } }] });
        const writable = await handle.createWritable();
        try { await writable.write(download.blob); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
        if (!download.evidence) { service.markDownloaded(download.manifest.archiveId); setCheckpointId(download.manifest.archiveId); }
        setNotice("Backup file saved. Keep a copy outside this browser.");
      } else {
        const url = browser.URL.createObjectURL(download.blob);
        const link = browser.document.createElement("a"); link.href = url; link.download = download.filename;
        browser.document.body.append(link); link.click(); link.remove();
        browser.setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
        setDownloadRequested(true); setNotice("Download started. Confirm the file is saved before migration, merge, or replacement.");
      }
    } catch (caught) { if (caught.name !== "AbortError") setError({ message: `The backup file could not be saved. ${caught.message}` }); }
  };
  const acknowledgeDownload = () => {
    if (!download?.evidence) {
      const result = service.markDownloaded(download.manifest.archiveId);
      if (result.ok) { setCheckpointId(download.manifest.archiveId); setNotice("Backup confirmed. You can now migrate, merge, or replace this saved revision."); }
    }
    setDownloadRequested(false);
  };
  const chooseArchive = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setPreview(null);
    const result = await run((options) => service.inspect(file, options));
    if (result?.ok && mounted.current) {
      setPreview(result.value); setMode("new");
      browser.requestAnimationFrame(() => previewRef.current?.focus());
    }
  };
  const importArchive = async () => {
    const result = await run((options) => service.importPreview(preview.id, { ...options, mode, title, checkpointId }), "Campaign imported. The previous collection is still available below.");
    if (result?.ok) { setPreview(null); setCheckpointId(null); }
  };
  const requestProtection = async () => {
    try { setProtectedStorage(Boolean(await browser.navigator?.storage?.persist?.())); }
    catch { setProtectedStorage(false); }
  };

  return (
    <div className="nf-backups">
      <header className="nf-backups-heading">
        <div><span className="kicker">Your campaign, kept safe</span><h1>Keep every adventure.</h1><p>One portable file for your scenes, heroes, images, and saved encounters. Bring it to another browser or keep it for a rainy day.</p></div>
        <span className={`tag ${inVault ? "tag-jade" : ""}`}><ShieldCheck size={15} /> {inVault ? "Transactional vault" : "Browser storage"}</span>
      </header>

      {error && <div className="nf-backups-alert" role="alert"><strong>We couldn’t finish that.</strong><p>{error.message} {error.recovery}</p><button className="btn btn-line btn-sm" onClick={() => setError(null)}>Dismiss</button></div>}
      {notice && <p className="nf-backups-notice" role="status"><Check size={17} /> {notice}</p>}
      {status && readOnly && <section className="nf-backups-alert"><strong>Your original data is being preserved.</strong><p>{current?.message || "The saved records need recovery before they can be edited."} Export recovery evidence, restore a valid previous save, or open a separate clean campaign.</p></section>}
      {status?.legacyChanged && <section className="nf-backups-alert"><strong>The older browser save has changed.</strong><p>An older tab may have saved after migration. Your vault has not been overwritten. Export recovery evidence to preserve both versions before reviewing an import.</p></section>}

      <div className="nf-backups-grid">
        <section className="nf-backups-main">
          <div className="nf-backups-section-title"><ArrowDownToLine size={23} /><div><span className="kicker">01 / Preserve</span><h2>A complete copy. Yours to keep.</h2></div></div>
          <p>Maps and portraits travel with the data. Downloads contain no sign-in credentials, browser settings, or links that depend on this device.</p>
          <dl className="nf-backups-counts">
            <div><dt>Scenes</dt><dd>{current?.value?.scenes?.length ?? "—"}</dd></div>
            <div><dt>Heroes</dt><dd>{current?.value?.heroes?.length ?? "—"}</dd></div>
            <div><dt>Saved revision</dt><dd>{current?.value?.revision ?? "—"}</dd></div>
          </dl>
          <button className="btn btn-key btn-lg" disabled={busy || !status || readOnly} onClick={() => exportBackup()}><ArrowDownToLine size={17} /> Create backup</button>
          <p className="note">Includes the currently selected campaign. Maximum archive size: 256 MiB.</p>

          {download && <div className="nf-backups-download">
            <FileCheck2 size={23} /><div><strong>{download.filename}</strong><span>{sizeLabel(download.blob.size)} · {download.evidence ? "Preserved recovery evidence" : download.degraded ? "Incomplete images — review missing files" : "State and images included"}</span>
              {download.degraded && <p className="note">Missing: {download.manifest.missing.map((entry) => entry.name || entry.key).join(", ")}. The archive records these gaps explicitly.</p>}
            </div>
            <button className="btn btn-line" onClick={saveDownload} disabled={busy}>Save file</button>
            {downloadRequested && !download.evidence && <label className="nf-backups-check"><input type="checkbox" onChange={acknowledgeDownload} /> I have saved this backup file.</label>}
          </div>}

          <div className="nf-backups-section-title nf-backups-import-title"><ArrowUpFromLine size={23} /><div><span className="kicker">02 / Bring it back</span><h2>Restore with a clear preview.</h2></div></div>
          <p>Every file is inspected before activation. Import as a separate campaign by default; the current collection remains available.</p>
          <label className={`nf-backups-file ${busy ? "disabled" : ""}`}><ArrowUpFromLine size={25} /><strong>Choose a Nightforge archive</strong><span>.nightforge · state, maps, and portraits</span><input type="file" accept=".nightforge" aria-label="Choose a Nightforge archive" onChange={chooseArchive} disabled={busy} /></label>

          {preview && <section className="nf-backups-preview" ref={previewRef} tabIndex={-1} aria-label="Archive preview">
            <div className="nf-backups-preview-heading"><h3>Ready for your review</h3><button className="btn btn-line btn-sm" aria-label="Close archive preview" onClick={() => setPreview(null)} disabled={busy}><X size={15} /></button></div>
            <p>{preview.filename}</p>
            <dl className="nf-backups-counts"><div><dt>Scenes</dt><dd>{preview.counts.scenes}</dd></div><div><dt>Heroes</dt><dd>{preview.counts.heroes}</dd></div><div><dt>Images</dt><dd>{preview.counts.images}</dd></div></dl>
            <p className="note">Estimated additional storage: {sizeLabel(preview.storageBytes)}. {preview.collisions} existing identifiers overlap; separate campaigns keep their identities isolated.</p>
            {preview.missing.length > 0 && <p className="nf-backups-warning">This archive declares {preview.missing.length} missing images. They will remain visibly unavailable.</p>}
            {preview.quarantined > 0 && <p className="nf-backups-warning">{preview.quarantined} unrecognized fields or records will be preserved for review without executing their content.</p>}
            <details><summary>Scenes and heroes in this file</summary><ul>{[...preview.scenes, ...preview.heroes].map((entry, index) => <li key={`${index}-${entry.id}`}>{entry.name || entry.id}</li>)}</ul></details>
            <label className="field"><span className="label">Campaign name</span><input className="inp" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} disabled={busy} /></label>
            <fieldset className="nf-backups-options"><legend>How should it open?</legend>
              {[ ["new", "Separate campaign", "Keep both collections and switch to the imported one."], ["merge", "Merge a copy", "Copy scenes and heroes into a combined collection with new identifiers."], ["replace", "Use this saved version", "Switch to the imported version and retain the previous collection for recovery."] ].map(([value, label, description]) => <label key={value}><input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={busy} /><span><strong>{label}</strong><small>{description}</small></span></label>)}
            </fieldset>
            {mode !== "new" && !checkpointId && <p className="note">Create and save a current backup above before continuing with this option.</p>}
            <button className="btn btn-key" onClick={importArchive} disabled={busy || !title.trim() || (mode !== "new" && !checkpointId)}>Import campaign</button>
          </section>}
        </section>

        <aside className="nf-backups-aside">
          <section><div className="nf-backups-section-title"><Database size={20} /><h2>On this device</h2></div>
            <p>{inVault ? "Your campaign saves in one transaction. Images needed by the previous save stay protected." : "Your existing browser save stays in place until you choose to migrate it. Save a portable backup first."}</p>
            {!inVault && !readOnly && <button className="btn btn-line" disabled={busy || !checkpointId} onClick={() => run((options) => service.migrate(checkpointId, options), "Migration complete. The original browser save is preserved.")}>Move into the vault</button>}
            {storage && <p className="note">{sizeLabel(storage.usage)} used · {sizeLabel(storage.quota)} browser allowance</p>}
            <button className="btn btn-line btn-sm" onClick={requestProtection} disabled={busy}>Request storage protection</button>
            {protectedStorage !== null && <p className="note" role="status">{protectedStorage ? "The browser granted persistent storage. Keep portable backups as well." : "The browser did not grant persistent storage. Portable backups remain available."}</p>}
          </section>

          <section><div className="nf-backups-section-title"><Undo2 size={20} /><h2>Recovery tools</h2></div><p>Recover a previous save or preserve damaged data for inspection. Opening a clean campaign leaves the original records intact.</p>
            <div className="nf-backups-actions"><button className="btn btn-line" disabled={busy} onClick={() => exportBackup(true)}>Export recovery evidence</button><button className="btn btn-line" disabled={busy} onClick={() => run(() => service.restoreBackup(), "The previous save is open in a separate recovered campaign.")}>Restore previous save</button><button className="btn btn-line" disabled={busy} onClick={() => run(() => service.startClean(), "A separate clean campaign is ready. Previous records are preserved.")}>Open clean campaign</button><button className="btn btn-line btn-sm" disabled={busy} onClick={refresh}><RefreshCw size={14} /> Retry / refresh</button></div>
          </section>

          {status?.collections?.length > 0 && <section><h2>Your collections</h2><div className="nf-backups-collections">{status.collections.map((collection) => <button key={collection.generation} className={collection.generation === current?.value?.vaultGeneration ? "selected" : ""} disabled={busy || collection.generation === current?.value?.vaultGeneration} onClick={() => run(() => service.selectCollection(collection.generation), `Opened ${collection.title}.`)}><strong>{collection.title}</strong><span>{collection.scenes} scenes · {collection.heroes} heroes</span>{collection.generation === current?.value?.vaultGeneration && <small>Current</small>}</button>)}</div></section>}
          {status?.jobs?.some((job) => job.status !== "committed") && <section><h2>Unfinished imports</h2><p className="note">Select the same archive to resume a partial upload. A ready import has all its files preserved.</p>{status.jobs.filter((job) => job.status !== "committed").map((job) => <div className="nf-backups-job" key={job.id}><strong>{job.title}</strong><span>{job.status} · {job.imageCount} images</span><button className="btn btn-line btn-sm" disabled={busy} onClick={() => run(() => service.discardImport(job.id), "Inactive staging files discarded. Active campaigns were preserved.")}>Discard unfinished import</button></div>)}</section>}
          <p className="nf-backups-footnote"><ShieldCheck size={17} /> Browser storage can be cleared or lost. A copy on another device is your most reliable recovery path.</p>
        </aside>
      </div>
      {busy && <div className="nf-backups-progress" role="status" aria-live="polite"><div><strong>{progress?.stage === "validating" ? "Inspecting your archive" : progress?.stage === "reading" ? "Reading campaign images" : progress?.stage === "packing" ? "Preparing your file" : "Working safely"}</strong><span>{progress ? `${progress.completed || 0} / ${progress.total || 0} images` : "The previous campaign remains available until commit."}</span></div><button className="btn btn-line btn-sm" onClick={() => controller.current?.abort()}>Cancel</button></div>}
    </div>
  );
}
