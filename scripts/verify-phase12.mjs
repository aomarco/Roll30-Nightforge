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
  "actions/upload-pages-artifact@v3",
  "actions/deploy-pages@v4",
]) if (!workflow.includes(contract)) failures.push(`Pages workflow is missing ${contract}.`);

const constants = await read("src/storage/constants.js");
for (const key of [
  "roll30-nightforge-v1:state",
  "roll30-nightforge-v1:state-backup",
  "roll30-nightforge-v1:session",
  "roll30-nightforge-assets",
]) if (!constants.includes(key)) failures.push(`Fresh Nightforge storage identifier is missing: ${key}.`);

if (failures.length) {
  console.error("Phase 12 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 12 release configuration preserves all seven protected Nightforge visual files.");
console.log("Preview and production Pages builds use isolated /Roll30-Nightforge/ and /Roll30/ bases.");
console.log("Pages deployment remains gated by the complete verification suite and isolated Nightforge storage identifiers.");
