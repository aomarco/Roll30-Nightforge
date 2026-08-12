import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { CLASSES, LANGUAGES, RACES, SAVING_THROWS, SKILLS } from "../src/domain/heroes.js";

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
  "src/domain/heroes.js",
  "src/phase4.test.js",
  "scripts/phase4-render-smoke.mjs",
]) {
  try { await read(relativePath); }
  catch { failures.push(`Missing Phase 4 file: ${relativePath}`); }
}

if (CLASSES.length !== 2 || !CLASSES.some((entry) => entry.id === "fighter") || !CLASSES.some((entry) => entry.id === "wizard")) {
  failures.push("Phase 4 must contain exactly the implemented Fighter and Wizard classes.");
}
if (RACES.length !== 9) failures.push(`Expected 9 races, received ${RACES.length}.`);
if (RACES.flatMap((race) => race.subraces).length !== 4) failures.push("Expected exactly 4 implemented subraces.");
if (SAVING_THROWS.length !== 6) failures.push(`Expected 6 saving throws, received ${SAVING_THROWS.length}.`);
if (SKILLS.length !== 18) failures.push(`Expected 18 skills, received ${SKILLS.length}.`);
if (LANGUAGES.length !== 16) failures.push(`Expected 16 languages, received ${LANGUAGES.length}.`);

const app = await read("src/App.jsx");
const heroes = await read("src/screens/HeroesScreen.jsx");
const commands = await read("src/application/commands.js");
const records = await read("src/domain/records.js");
for (const integration of ["heroes={state.heroes}", "onCreate", "onUpdate", "onRetire", "heroFlushRef"]) {
  if (!app.includes(integration)) failures.push(`App is missing Hero integration ${integration}.`);
}
for (const behavior of [
  "deriveHero",
  "changeClass",
  "changeRace",
  "changeAbility",
  "saveModifier",
  "skillModifier",
  "Wizard spellcasting",
  "Retire hero",
]) {
  if (!heroes.includes(behavior)) failures.push(`Heroes screen is missing ${behavior}.`);
}
if (!heroes.includes('disabled title="Gear becomes functional in Phase 5"')) failures.push("Unavailable Gear chapter is not honestly disabled.");
if (/CHARACTERS|ABILITIES = \[|INVENTORY|const noop/.test(heroes)) failures.push("Heroes screen still contains prototype fixture data or handlers.");
if (!commands.includes("const updateHero")) failures.push("Hero transition policy is not enforced by application commands.");
if (!records.includes("normalizeBaseAbilities")) failures.push("Hero records do not enforce point-buy normalization.");

const functionalCss = await read("src/styles/functional-states.css");
const cssWithoutComments = functionalCss.replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of cssWithoutComments.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) {
    if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
  }
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
  if (/[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u.test(contents)) {
    failures.push(`${relativePath}: contains malformed UTF-8/mojibake text.`);
  }
}

const packageJson = JSON.parse(await read("package.json"));
for (const scriptName of ["verify:phase4", "test:phase4:render"]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`Missing npm script ${scriptName}.`);
}

if (failures.length) {
  console.error("Phase 4 verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("All permanent Nightforge visual files match the frozen baseline.");
console.log("Phase 4 catalogs contain 2 classes, 9 races, 4 subraces, 6 saves, 18 skills, and 16 languages.");
console.log("Hero CRUD, derivation, Identity, Abilities, Wizard scaffold, and clean-room boundaries are present.");
