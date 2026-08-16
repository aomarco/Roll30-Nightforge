import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, MAP_MAX_SCALE, MAP_MIN_SCALE } from "../src/domain/table.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const hash = async (file) => createHash("sha256").update(await readFile(resolve(root, file))).digest("hex").toUpperCase();
const baseline = JSON.parse(await read("scripts/nightforge-baseline-hashes.json"));
const failures = [];

for (const file of ["src/styles/core.css", "src/styles/shell.css", "src/styles/library.css", "src/styles/heroes.css", "src/styles/scene.css", "src/styles/table.css", "src/ui/Glyphs.jsx"]) {
  if (await hash(file) !== baseline[file]) failures.push(`${file}: permanent Nightforge visual changed.`);
}

for (const file of ["src/domain/table.js", "src/phase6.test.js", "scripts/phase6-render-smoke.mjs", "scripts/verify-phase6.mjs"]) {
  try { await read(file); } catch { failures.push(`Missing Phase 6 file: ${file}`); }
}

if (CAMERA_MIN_ZOOM !== 0.35 || CAMERA_MAX_ZOOM !== 3) failures.push("Camera zoom clamp must remain 0.35 through 3.");
if (MAP_MIN_SCALE !== 0.2 || MAP_MAX_SCALE !== 5) failures.push("Artwork scale clamp must remain 0.2 through 5.");

const table = await read("src/screens/TableScreen.jsx");
for (const behavior of [
  "zoomCameraAt", "zoomCameraAtViewportCenter", "adjustArtworkBy", "createPlayToken", "updateToken", "removeToken",
  "createWall", "rulerDistanceFeet", "Table tools — 5 ft grid", "Draw full wall", "Draw half-wall", "toggleWalls",
  "Hide walls", "Reset camera", "Reset artwork transform", "Escape", "onMapPointerCancel", "createPortal", "returnTo: { page: \"board\", mode }",
]) {
  if (!table.includes(behavior)) failures.push(`Table screen is missing ${behavior}.`);
}
if (!table.includes("normalizeTableTokens(scene?.tokens)")) failures.push("The Table does not select persisted Scene tokens.");
if (table.includes("const TOKENS =")) failures.push("The original all-mode Table fixture remains active.");
if (table.includes("BATTLE_PROTOTYPE_TOKENS")) failures.push("A deferred Battle fixture remains after real Scene-token integration.");

const app = await read("src/App.jsx");
for (const integration of ["onUpdate={runtime.commands.updateScene}", "artworkRepository={runtime.artworkRepository}", "persistence={state.persistence}"]) {
  if (!app.includes(integration)) failures.push(`App is missing Table integration ${integration}.`);
}

const records = await read("src/domain/records.js");
for (const normalizer of ["normalizeMapView", "normalizeTableTokens", "normalizeWalls"]) {
  if (!records.includes(normalizer)) failures.push(`Scene records are missing ${normalizer}.`);
}
if (/camera\s*:/.test(records)) failures.push("Transient camera state must not be persisted by Scene records.");

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
}

const runtimeFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:js|jsx|css)$/.test(entry.name) && !entry.name.endsWith(".test.js")) runtimeFiles.push(file);
  }
};
await collect(resolve(root, "src"));
for (const file of runtimeFiles) {
  const contents = await readFile(file, "utf8");
  const relative = file.slice(root.length + 1).replaceAll("\\", "/");
  if (/Documents[\\/]Roll30|UI Redesign Attempt|\.\.[\\/]\.\.[\\/]Roll30/.test(contents)) failures.push(`${relative}: contains an original-project path or import.`);
  if (relative !== "src/storage/constants.js" && /roll30-maps|roll30-active-map|roll30-characters|roll30-assets/.test(contents)) failures.push(`${relative}: accesses an original Roll30 save identifier.`);
  if (/[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u.test(contents)) failures.push(`${relative}: contains malformed UTF-8/mojibake text.`);
}

const packageJson = JSON.parse(await read("package.json"));
for (const script of ["verify:phase6", "test:phase6:render"]) if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);

if (failures.length) {
  console.error("Phase 6 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("All permanent Nightforge visual files match the frozen baseline.");
console.log("Phase 6 camera, artwork, Play tokens, walls, ruler, Table Tools, persistence, and clean-room boundaries are present.");
console.log("Scene Settings retains its exact Table return context and camera state remains transient.");
