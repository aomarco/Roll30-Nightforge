import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(resolve(root, "scripts/nightforge-baseline-hashes.json"), "utf8"),
);
const failures = [];

const permanentVisualFiles = Object.entries(manifest).filter(
  ([relativePath]) => relativePath.startsWith("src/styles/") || relativePath === "src/ui/Glyphs.jsx",
);

for (const [relativePath, expected] of permanentVisualFiles) {
  const contents = await readFile(resolve(root, relativePath));
  const actual = createHash("sha256").update(contents).digest("hex").toUpperCase();
  if (actual !== expected) failures.push(`${relativePath}: expected ${expected}, received ${actual}`);
}

const requiredFiles = [
  "src/application/commands.js",
  "src/application/result.js",
  "src/application/state.js",
  "src/domain/records.js",
  "src/storage/artworkRepository.js",
  "src/storage/constants.js",
  "src/storage/entityRepositories.js",
  "src/storage/envelope.js",
  "src/storage/sessionRepository.js",
  "src/storage/stateRepository.js",
];

for (const relativePath of requiredFiles) {
  try {
    await readFile(resolve(root, relativePath));
  } catch {
    failures.push(`Missing Phase 1 runtime file: ${relativePath}`);
  }
}

const sourceFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:js|jsx|css)$/.test(entry.name) && !entry.name.endsWith(".test.js")) {
      sourceFiles.push(path);
    }
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

const constants = await readFile(resolve(root, "src/storage/constants.js"), "utf8");
for (const requiredIdentifier of [
  "roll30-nightforge-v1:state",
  "roll30-nightforge-v1:state-backup",
  "roll30-nightforge-v1:session",
  "roll30-nightforge-assets",
  "scene-artwork",
]) {
  if (!constants.includes(requiredIdentifier)) {
    failures.push(`Missing fresh Nightforge identifier: ${requiredIdentifier}`);
  }
}

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
for (const scriptName of ["test", "verify:phase1", "verify"]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`Missing npm script: ${scriptName}`);
}

if (failures.length) {
  console.error("Phase 1 verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Nightforge permanent visual baseline preserved across ${permanentVisualFiles.length} protected files.`);
console.log(`Phase 1 runtime boundary verified across ${sourceFiles.length} source files.`);
console.log("Fresh Nightforge storage identifiers are present; original Roll30 keys are absent from runtime usage.");
