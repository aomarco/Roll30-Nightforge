import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const manifest = JSON.parse(await read("scripts/nightforge-baseline-hashes.json"));
const failures = [];

for (const relativePath of [
  "src/styles/core.css",
  "src/styles/shell.css",
  "src/styles/library.css",
  "src/styles/heroes.css",
  "src/styles/scene.css",
  "src/styles/table.css",
  "src/ui/Glyphs.jsx",
]) {
  const contents = await readFile(resolve(root, relativePath));
  const actual = createHash("sha256").update(contents).digest("hex").toUpperCase();
  if (actual !== manifest[relativePath]) failures.push(`${relativePath}: permanent Nightforge visual changed.`);
}

for (const relativePath of [
  "src/application/artwork.js",
  "src/phase3.test.js",
  "scripts/phase3-render-smoke.mjs",
]) {
  try { await read(relativePath); }
  catch { failures.push(`Missing Phase 3 file: ${relativePath}`); }
}

const sceneScreen = await read("src/screens/SceneScreen.jsx");
const commands = await read("src/application/commands.js");
const scenes = await read("src/storage/entityRepositories.js");
const app = await read("src/App.jsx");
const table = await read("src/screens/TableScreen.jsx");

for (const integration of [
  "onUpdate",
  "onReplaceArtwork",
  "onUseWhiteCanvas",
  "flushRef",
  "returnTo",
]) {
  if (!sceneScreen.includes(integration)) failures.push(`Scene workbench is missing ${integration}.`);
}
for (const command of ["replaceSceneArtwork", "useWhiteCanvas", "cleanupPendingArtwork"]) {
  if (!commands.includes(command)) failures.push(`Application commands are missing ${command}.`);
}
for (const operation of ["updateArtwork", "scheduleArtworkDelete", "acknowledgeArtworkDelete"]) {
  if (!scenes.includes(operation)) failures.push(`Scene repository is missing ${operation}.`);
}
if (!app.includes("workbenchFlushRef")) failures.push("App does not flush Scene drafts before navigation.");
if (!table.includes('returnTo: { page: "board", mode }')) failures.push("Table settings does not preserve return context.");
if (/const noop|onUpload = \(\) => \{\}|onNoMap = \(\) => \{\}/.test(sceneScreen)) {
  failures.push("Scene workbench still contains prototype handlers.");
}

const sourceFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:js|jsx|css)$/.test(entry.name) && !entry.name.endsWith(".test.js")) sourceFiles.push(path);
  }
};
await collect(resolve(root, "src"));
for (const path of sourceFiles) {
  const relativePath = path.slice(root.length + 1).replaceAll("\\", "/");
  const contents = await readFile(path, "utf8");
  if (/Documents[\\/]Roll30|UI Redesign Attempt|\.\.[\\/]\.\.[\\/]Roll30/.test(contents)) {
    failures.push(`${relativePath}: contains an original-project path or import.`);
  }
}

const packageJson = JSON.parse(await read("package.json"));
for (const scriptName of ["verify:phase3", "test:phase3:render"]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`Missing npm script ${scriptName}.`);
}

if (failures.length) {
  console.error("Phase 3 verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("All permanent Nightforge visual files match the frozen baseline.");
console.log("Phase 3 Scene workbench, artwork recovery, autosave, and return-context boundaries are present.");
console.log("Nightforge source remains isolated from original Roll30 paths and imports.");
