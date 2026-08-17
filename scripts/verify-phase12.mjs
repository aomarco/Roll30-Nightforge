import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const hash = async (file) => createHash("sha256").update(await readFile(resolve(root, file))).digest("hex").toUpperCase();
const failures = [];

const baseline = JSON.parse(await read("scripts/nightforge-baseline-hashes.json"));
for (const file of [
  "src/styles/core.css",
  "src/styles/shell.css",
  "src/styles/library.css",
  "src/styles/heroes.css",
  "src/styles/scene.css",
  "src/styles/table.css",
  "src/ui/Glyphs.jsx",
]) if (await hash(file) !== baseline[file]) failures.push(`${file}: permanent Nightforge visual hash changed.`);

const packageJson = JSON.parse(await read("package.json"));
if (packageJson.scripts?.build !== "vite build --base=/Roll30/") failures.push("Production build must use the exact /Roll30/ base.");
if (packageJson.scripts?.["build:preview"] !== "vite build --base=/Roll30-Nightforge/") failures.push("Preview build must use the exact /Roll30-Nightforge/ base.");
if (!packageJson.scripts?.verify?.includes("verify:phase12")) failures.push("The full verification gate omits Phase 12.");
if (packageJson.scripts?.["acceptance:phase12"] !== "node scripts/phase12-live-acceptance.mjs") failures.push("The repeatable Phase 12 live-acceptance command is missing.");

const liveAcceptance = await read("scripts/phase12-live-acceptance.mjs");
for (const contract of [
  "FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS",
  "roll30-assets",
  "originalStorage",
  "databaseRecord",
  "malformedMarkers",
  "assetPaths.every",
]) if (!liveAcceptance.includes(contract)) failures.push(`Live acceptance coverage is missing ${contract}.`);

const workflow = await read(".github/workflows/deploy-pages.yml");
for (const contract of [
  "branches: [main]",
  "pages: write",
  "id-token: write",
  "npm ci",
  "playwright install --with-deps chromium",
  "npm run verify",
  "aomarco/Roll30",
  "npm run build:preview",
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
  "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0",
  "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0",
]) if (!workflow.includes(contract)) failures.push(`Pages workflow is missing ${contract}.`);
const actionReferences = [...workflow.matchAll(/^\s*-?\s*uses:\s*[^@\s]+@([^\s#]+)/gm)].map((match) => match[1]);
if (!actionReferences.length || actionReferences.some((reference) => !/^[0-9a-f]{40}$/.test(reference))) {
  failures.push("Every Pages workflow action must be pinned to an immutable full commit SHA.");
}
if ((workflow.match(/pages: write/g) || []).length !== 1 || (workflow.match(/id-token: write/g) || []).length !== 1) {
  failures.push("Pages and identity-token write permissions must exist only on the deploy job.");
}
const deployJob = workflow.slice(workflow.indexOf("\n  deploy:"));
if (!deployJob.includes("permissions:\n      pages: write\n      id-token: write")) {
  failures.push("The deploy job does not own its narrowly scoped Pages permissions.");
}

const constants = await read("src/storage/constants.js");
for (const key of [
  "roll30-nightforge-v1:state",
  "roll30-nightforge-v1:state-backup",
  "roll30-nightforge-v1:session",
  "roll30-nightforge-assets",
]) if (!constants.includes(key)) failures.push(`Fresh Nightforge storage identifier is missing: ${key}.`);

const completionRecord = await read("Phase Completion.txt");
for (const contract of [
  "PHASE 12 COMPLETION RECORD",
  "pre-nightforge-2026-08-17",
  "32019078653",
  "https://aomarco.github.io/Roll30/",
  "Phase 12 is complete.",
]) if (!completionRecord.includes(contract)) failures.push(`Phase 12 completion evidence is missing ${contract}.`);

if (failures.length) {
  console.error("Phase 12 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 12 release configuration preserves all seven protected Nightforge visual files.");
console.log("Preview and production Pages builds use isolated /Roll30-Nightforge/ and /Roll30/ bases.");
console.log("Pages deployment remains gated by the complete verification suite and isolated Nightforge storage identifiers.");
