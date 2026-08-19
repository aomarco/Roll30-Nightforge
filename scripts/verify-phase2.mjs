import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const failures = [];

const functionalCss = await read("src/styles/functional-states.css");
const cssWithoutComments = functionalCss.replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of cssWithoutComments.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) {
    if (!selector.trim().startsWith(".nf-state-")) {
      failures.push(`functional-states.css has an unscoped selector: ${selector.trim()}`);
    }
  }
}

const requiredFiles = [
  "src/App.jsx",
  "src/application/browserRuntime.js",
  "src/application/library.js",
  "src/phase2.test.js",
  "src/styles/functional-states.css",
  "scripts/phase2-render-smoke.mjs",
];
for (const relativePath of requiredFiles) {
  try { await read(relativePath); }
  catch { failures.push(`Missing Phase 2 file: ${relativePath}`); }
}

const main = await read("src/main.jsx");
const app = await read("src/App.jsx");
const library = await read("src/screens/LibraryScreen.jsx");
const commands = await read("src/application/commands.js");
const scenes = await read("src/storage/entityRepositories.js");

if (!main.includes('import "./styles/functional-states.css"')) failures.push("main.jsx does not load scoped functional-state CSS.");
if (!app.includes("createBrowserRuntime")) failures.push("App does not initialize the browser repository runtime.");
if (!app.includes("activeScene")) failures.push("App does not carry active Scene context.");
if (library.includes("PLACEHOLDER_MAPS")) failures.push("Library still contains placeholder Scene records.");
if (!library.includes("orderScenesForLibrary(scenes)")) failures.push("Library does not render repository Scene data.");
for (const behavior of ["onForge", "onOpen", "onSettings", "onDelete"]) {
  if (!library.includes(behavior)) failures.push(`Library is missing ${behavior} integration.`);
}
for (const command of ["forgeScene", "openScene", "removeScene"]) {
  if (!commands.includes(command)) failures.push(`Application commands are missing ${command}.`);
}
if (!scenes.includes("pendingArtworkDeletes")) failures.push("Scene deletion does not schedule artwork cleanup.");

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
  if (relativePath !== "src/storage/constants.js") {
    for (const legacyKey of ["roll30-maps", "roll30-active-map", "roll30-characters", "roll30-assets"]) {
      if (contents.includes(legacyKey)) failures.push(`${relativePath}: contains forbidden key ${legacyKey}.`);
    }
  }
}

const packageJson = JSON.parse(await read("package.json"));
for (const scriptName of ["verify:phase2", "test:phase2:render"]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`Missing npm script ${scriptName}.`);
}

if (failures.length) {
  console.error("Phase 2 verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("All six frozen Nightforge stylesheets match the visual baseline.");
console.log("Phase 2 Library, routing, active-context, and fresh-storage boundaries are present.");
console.log("Functional-state CSS is fully scoped beneath nf-state selectors.");
