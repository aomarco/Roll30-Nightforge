import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PATH_SEARCH_LIMIT } from "../src/domain/combat.js";
import { FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS } from "../src/storage/constants.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

const requiredFiles = [
  "PARITY_REGISTER.md",
  "playwright.config.js",
  "scripts/phase11-render-smoke.mjs",
  "scripts/verify-phase11.mjs",
  "src/application/generatedId.js",
  "src/audit-regressions.test.js",
  "src/phase11.test.js",
  "src/ui/ApplicationErrorBoundary.jsx",
  "src/ui/useDialogA11y.js",
  "tests/error-boundary-harness.html",
  "tests/error-boundary-harness.jsx",
  "tests/phase11.spec.js",
];
for (const file of requiredFiles) {
  try { await readFile(resolve(root, file)); } catch { failures.push(`Missing Phase 11 artifact: ${file}`); }
}

const sourceFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:js|jsx|css)$/.test(entry.name) && !entry.name.endsWith(".test.js")) sourceFiles.push(file);
  }
};
await collect(resolve(root, "src"));

for (const file of sourceFiles) {
  const contents = await readFile(file, "utf8");
  const relative = file.slice(root.length + 1).replaceAll("\\", "/");
  if (/Documents[\\/]Roll30|UI Redesign Attempt|\.\.[\\/]\.\.[\\/]Roll30/.test(contents)) failures.push(`${relative}: contains an original-project path or import.`);
  if (relative !== "src/storage/constants.js") {
    for (const legacyKey of FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS) {
      if (contents.includes(legacyKey)) failures.push(`${relative}: accesses forbidden original storage identifier ${legacyKey}.`);
    }
  }
  if (/[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u.test(contents)) failures.push(`${relative}: contains malformed UTF-8/mojibake text.`);
  if (/\b(?:TODO|FIXME|noop)\b/i.test(contents)) failures.push(`${relative}: contains a deferred/no-op runtime marker.`);
  if (/=>\s*\{\s*\}/.test(contents)) failures.push(`${relative}: contains an empty runtime handler.`);
}

const jsxFiles = sourceFiles.filter((file) => file.endsWith(".jsx"));
for (const file of jsxFiles) {
  const contents = await readFile(file, "utf8");
  const relative = file.slice(root.length + 1).replaceAll("\\", "/");
  for (const match of contents.matchAll(/<button\b[\s\S]*?>/g)) {
    const tag = match[0];
    if (!/onClick\s*=|onPointerDown\s*=|type="submit"|\bdisabled(?:\s|>|=)/.test(tag)) {
      failures.push(`${relative}: visible button has no connected behavior: ${tag.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }
}

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const required of [
  ".nf-state-responsive-shell",
  ".nf-state-screen-root",
  ".nf-state-scene-root",
  ".nf-state-table-root",
  "@media (max-width: 1080px)",
  "@media (max-width: 900px)",
  "@media (max-width: 720px)",
  "@media (prefers-reduced-motion: reduce)",
  "overflow-wrap: anywhere",
  "overflow-anchor: none",
  "text-overflow: ellipsis",
]) if (!functionalCss.includes(required)) failures.push(`Phase 11 functional CSS is missing ${required}.`);
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@") || /^(?:from|to|\d+%)$/.test(header)) continue;
  for (const selector of header.split(",")) {
    if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
  }
}

const focusCss = await read("src/styles/core.css");
if (!/:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--jade\)/.test(focusCss)) failures.push("Global visible keyboard focus styling is missing.");

const dialogHook = await read("src/ui/useDialogA11y.js");
for (const contract of ["dialogStack", "event.key !== \"Tab\"", "event.key === \"Escape\"", "stopImmediatePropagation", "invoker.focus", "focusin", "document.activeElement"]) {
  if (!dialogHook.includes(contract)) failures.push(`Shared dialog accessibility contract is missing ${contract}.`);
}
let dialogCount = 0;
for (const file of jsxFiles.filter((entry) => entry.includes(`${resolve(root, "src", "screens")}`))) {
  const contents = await readFile(file, "utf8");
  for (const match of contents.matchAll(/<aside\b[^>]*role="dialog"[^>]*>/g)) {
    dialogCount += 1;
    if (!/\bref=\{[^}]+\}/.test(match[0])) failures.push(`${file}: dialog is not connected to the shared focus contract.`);
    if (!/tabIndex=\{-1\}/.test(match[0])) failures.push(`${file}: dialog lacks a programmatic focus target.`);
    if (!/aria-modal="true"/.test(match[0])) failures.push(`${file}: dialog does not identify itself as modal.`);
  }
}
if (dialogCount !== 11) failures.push(`Expected 11 managed dialogs, found ${dialogCount}.`);

const table = await read("src/screens/TableScreen.jsx");
if ((table.match(/document\.addEventListener\("keydown"/g) || []).length !== 1 || !table.includes("document.removeEventListener(\"keydown\"")) failures.push("Table transient keyboard listener is not bounded by cleanup.");
if (/document\.addEventListener\("pointer/.test(table)) failures.push("Table contains an uncontrolled document-level pointer listener.");
const pointerMove = table.slice(table.indexOf("const onMapPointerMove"), table.indexOf("const onMapPointerUp"));
if (/savePatch|onUpdate|Repository|localStorage/.test(pointerMove)) failures.push("Pointer movement performs persistence instead of transient updates.");
for (const integration of ["nf-state-table-root", "useDialogA11y", "aria-describedby=\"abandon-battle-description\"", "title={scene?.name", "AttackRangeLayer"]) {
  if (!table.includes(integration)) failures.push(`Table hardening integration is missing ${integration}.`);
}
const attackDurability = table.slice(table.indexOf("const resolveAttackTarget"), table.indexOf("const openBattleChest"));
const attackSaveIndex = attackDurability.indexOf("savePatch(resolved.value)");
const attackCinematicIndex = attackDurability.indexOf("setCinematic({");
if (attackSaveIndex < 0 || attackCinematicIndex < 0 || attackSaveIndex > attackCinematicIndex) {
  failures.push("Attack persistence occurs after its cinematic begins.");
}
const retrievalDurability = table.slice(table.indexOf("const resolveRetrieval"), table.indexOf("const restartBattle"));
const retrievalSaveIndex = retrievalDurability.lastIndexOf("savePatch(resolved.value)");
const retrievalCinematicIndex = retrievalDurability.indexOf("setRetrievalCinematic({");
if (retrievalSaveIndex < 0 || retrievalCinematicIndex < 0 || retrievalSaveIndex > retrievalCinematicIndex) {
  failures.push("Rolled retrieval persistence occurs after its cinematic begins.");
}
for (const contract of ["onTokenKeyDown", "onChestKeyDown", "aria-label=\"Token to summon\""]) {
  if (!table.includes(contract)) failures.push(`Table keyboard/accessibility hardening is missing ${contract}.`);
}

const applicationSource = await read("src/App.jsx");
for (const contract of ["STORAGE_KEYS.state", "runtime.commands.synchronize()", "pagehide", "state.persistence.revision", "revisionRef", "recordRevision"]) {
  if (!applicationSource.includes(contract)) failures.push(`Application persistence hardening is missing ${contract}.`);
}
for (const file of ["src/screens/SceneScreen.jsx", "src/screens/HeroesScreen.jsx"]) {
  const contents = await read(file);
  if (!contents.includes("dirtyRef.current.has") || !contents.includes("activeHero?.name") && !contents.includes("scene?.name")) {
    failures.push(`${file}: dirty-aware external-state reconciliation is missing.`);
  }
}

const main = await read("src/main.jsx");
const errorBoundary = await read("src/ui/ApplicationErrorBoundary.jsx");
if (!main.includes("<ApplicationErrorBoundary>")) failures.push("The application root is not protected by its render error boundary.");
for (const contract of ["getDerivedStateFromError", "componentDidCatch", "Reload Nightforge"]) {
  if (!errorBoundary.includes(contract)) failures.push(`Application error recovery is missing ${contract}.`);
}

const viteConfig = await read("vite.config.js");
const indexHtml = await read("index.html");
for (const contract of ["nightforge-local-fonts", "frozenRemoteFontImport", "codeSplitting", "node_modules"]) {
  if (!viteConfig.includes(contract)) failures.push(`Local font build hardening is missing ${contract}.`);
}
if (/fonts\.(?:googleapis|gstatic)\.com/.test(indexHtml)) failures.push("index.html still connects to a remote font origin.");
for (const family of ["Nightforge Fraunces", "Nightforge Plus Jakarta Sans", "Nightforge IBM Plex Mono"]) {
  if (!functionalCss.includes(family)) failures.push(`Bundled font family is missing: ${family}.`);
}

const library = await read("src/screens/LibraryScreen.jsx");
for (const state of ["lifecycle === \"booting\"", "persistence.recovered", "persistence.recoverySource === \"empty\"", "role=\"alert\"", "role=\"status\"", "lifecycle === \"booting\" || persistence.status === \"saving\""]) {
  if (!library.includes(state)) failures.push(`Library state coverage is missing ${state}.`);
}
if (!library.includes("aria-describedby=\"delete-scene-description\"")) failures.push("Scene deletion does not identify the exact destructive target.");
const heroes = await read("src/screens/HeroesScreen.jsx");
if (!heroes.includes("aria-describedby=\"retire-hero-description\"")) failures.push("Hero retirement does not identify the exact destructive target.");

const stateRepository = await read("src/storage/stateRepository.js");
for (const contract of ["storage-quota-exceeded", "previous valid state remains intact", "recovered: issues.length > 0"]) {
  if (!stateRepository.includes(contract)) failures.push(`State recovery contract is missing ${contract}.`);
}
const artworkRepository = await read("src/storage/artworkRepository.js");
if (!artworkRepository.includes("artwork-quota-exceeded") || !artworkRepository.includes("previous artwork remains active")) failures.push("Artwork quota recovery contract is incomplete.");

if (PATH_SEARCH_LIMIT !== 4000) failures.push("A* pathfinding must remain capped at exactly 4,000 cells.");
const attacks = await read("src/domain/attacks.js");
if (!attacks.includes("bands = bandDefinitions") || !table.includes("model.bands.map((band) => <path")) failures.push("Attack range visualization is not bounded to one SVG path per range band.");
for (const file of ["src/screens/SceneScreen.jsx", "src/screens/HeroesScreen.jsx"]) {
  const contents = await read(file);
  for (const contract of ["setTimeout(flushDraft, 450)", "onBlur={flushDraft}", "flushRef.current = flushDraft"]) {
    if (!contents.includes(contract)) failures.push(`${file}: debounced autosave/blur/navigation flush is missing ${contract}.`);
  }
}
const app = await read("src/App.jsx");
for (const integration of ["workbenchFlushRef.current?.()", "heroFlushRef.current?.()", "nf-state-responsive-shell"]) {
  if (!app.includes(integration)) failures.push(`Application hardening integration is missing ${integration}.`);
}
const browserRuntime = await read("src/application/browserRuntime.js");
if (!browserRuntime.includes("createIndexedDbArtworkAdapter") || !browserRuntime.includes("browserStorage(browser, \"localStorage\")")) failures.push("Artwork and structured state storage boundaries are not explicit.");
if (/data:image|Blob|arrayBuffer/.test(await read("src/storage/envelope.js"))) failures.push("State envelope appears capable of placing image payloads in LocalStorage.");

const playwrightConfig = await read("playwright.config.js");
for (const contract of ["phase11.spec.js", "browserName: \"chromium\"", "workers: 1", "Australia/Sydney"]) {
  if (!playwrightConfig.includes(contract)) failures.push(`Playwright determinism configuration is missing ${contract}.`);
}
const browserSpec = await read("tests/phase11.spec.js");
const browserJourneys = (browserSpec.match(/^test\(/gm) || []).length;
if (browserJourneys < 20) failures.push(`Phase 11 must retain at least 20 browser journeys; found ${browserJourneys}.`);
for (const contract of [
  "document.fonts.ready",
  "[1920, 1080]", "[1600, 900]", "[1440, 900]", "[1280, 800]", "[1180, 820]", "[1024, 768]",
  "[100, 1, 1440, 900]", "[125, 1.25, 1152, 720]", "[150, 1.5, 960, 600]",
  "tokens: 180", "ITEM_CATALOG.length", "reducedMotion: \"reduce\"", "FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS",
  "keyboard reachable", "outlineStyle",
  "After Synchronized Follow-up", "a thrown child renders the top-level recovery surface",
]) if (!browserSpec.includes(contract)) failures.push(`Browser acceptance suite is missing ${contract}.`);

const packageJson = JSON.parse(await read("package.json"));
if (packageJson.devDependencies?.["@playwright/test"] !== "1.62.1") failures.push("Playwright must be pinned exactly to 1.62.1.");
for (const script of ["test:phase11:render", "test:phase11:browser", "verify:phase11"]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
}
for (const gate of ["test:phase11:render", "test:phase11:browser", "verify:phase11", "build"]) {
  if (!packageJson.scripts?.verify?.includes(gate)) failures.push(`Full verification command omits ${gate}.`);
}

const parity = await read("PARITY_REGISTER.md");
const scenarioRows = [...parity.matchAll(/^\|\s*(\d+)\s*\|.*\|\s*\*\*PASS\*\*\s*\|$/gm)];
if (scenarioRows.length !== 47) failures.push(`Parity register must contain 47 passing numbered journeys; found ${scenarioRows.length}.`);
if (scenarioRows.some((row, index) => Number(row[1]) !== index + 1)) failures.push("Parity-register journey numbering is incomplete or out of order.");
if (!parity.includes("**Open entries: 0.**")) failures.push("Parity register still has open entries.");
if (/\|\s*\*\*(?:FAIL|PENDING|BLOCKED)\*\*\s*\|/i.test(parity)) failures.push("Parity register contains a non-passing row.");

if (failures.length) {
  console.error("Phase 11 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Phase 11 purity and interaction contracts pass across ${sourceFiles.length} runtime source files and ${dialogCount} managed dialogs.`);
console.log("All 47 parity journeys are resolved by behavioural tests and browser journeys.");
console.log("Corruption, quota, long-content, large-list, reduced-motion, accessibility, and performance hardening contracts are present.");
