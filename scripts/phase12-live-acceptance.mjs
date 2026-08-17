import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium, expect } from "@playwright/test";

import {
  ARTWORK_DATABASE,
  FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS,
  STORAGE_KEYS,
} from "../src/storage/constants.js";

const target = process.argv[2];
const expectedBase = process.argv[3];
const screenshotArgument = process.argv[4];

if (!target || !expectedBase?.startsWith("/") || !expectedBase.endsWith("/")) {
  console.error("Usage: node scripts/phase12-live-acceptance.mjs <url> </expected-base/> [screenshot-path]");
  process.exit(2);
}

const targetUrl = new URL(target);
const expectedLegacy = Object.fromEntries(
  FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS.map((key) => [key, `phase12-preserve:${key}`]),
);
const originalDatabase = "roll30-assets";
const originalStore = "phase12-release-sentinel";
const originalRecord = { id: "owner-save", value: "must-remain-untouched" };
const sceneName = "Phase 12 Preview Acceptance";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  colorScheme: "dark",
  locale: "en-AU",
  timezoneId: "Australia/Sydney",
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const pageErrors = [];
const failedResponses = [];

try {
  // Establish the Pages origin before loading Nightforge, then seed isolated
  // sentinels that stand in for original Roll30 browser saves.
  await page.goto(new URL(`${expectedBase}__phase12_bootstrap__`, targetUrl.origin).href, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(async ({ legacy, stateKey, backupKey, sessionKey, databaseName, storeName, record }) => {
    localStorage.clear();
    sessionStorage.clear();
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    localStorage.removeItem(stateKey);
    localStorage.removeItem(backupKey);
    sessionStorage.removeItem(sessionKey);

    await new Promise((resolvePromise, rejectPromise) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
      request.onerror = () => rejectPromise(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(record);
        transaction.oncomplete = () => {
          database.close();
          resolvePromise();
        };
        transaction.onerror = () => rejectPromise(transaction.error);
      };
    });
  }, {
    legacy: expectedLegacy,
    stateKey: STORAGE_KEYS.state,
    backupKey: STORAGE_KEYS.backup,
    sessionKey: STORAGE_KEYS.session,
    databaseName: originalDatabase,
    storeName: originalStore,
    record: originalRecord,
  });

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(targetUrl.origin) && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto(targetUrl.href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "The deployed entry document must return HTTP 200.");
  assert.equal(page.url(), targetUrl.href, "The deployed application must remain at its expected Pages URL.");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  const assetPaths = await page.evaluate(() =>
    performance.getEntriesByType("resource")
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin === location.origin && /\.(?:js|css)$/.test(url.pathname))
      .map((url) => url.pathname),
  );
  assert.ok(assetPaths.some((path) => path.endsWith(".js")), "The deployment must load a JavaScript asset.");
  assert.ok(assetPaths.some((path) => path.endsWith(".css")), "The deployment must load a stylesheet asset.");
  assert.ok(
    assetPaths.every((path) => path.startsWith(`${expectedBase}assets/`)),
    `Every application asset must load beneath ${expectedBase}assets/.`,
  );

  await page.getByRole("button", { name: "Forge a scene", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Forge a scene" })).toBeVisible();
  await page.getByLabel("Scene name").fill(sceneName);
  await page.getByRole("dialog", { name: "Forge a scene" }).locator(".picks .pick").first().click();
  await page.getByRole("button", { name: "Forge scene", exact: true }).click();
  await expect(page.locator(".nf-state-table-root")).toBeVisible();
  await expect(page.getByText("Free play", { exact: true }).first()).toBeVisible();

  await page.getByTitle("All maps").first().click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Heroes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New hero", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Unnamed hero", exact: true })).toBeVisible();
  await expect(page.getByText("Level 1 Fighter · Human", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Acrobatics DEX/ })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByText(sceneName, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: `Settings for ${sceneName}` }).click();
  await expect(page.locator(".nf-state-scene-root")).toBeVisible();
  await page.getByLabel("Map name").fill(`${sceneName} Renamed`);
  await page.getByLabel("Map name").blur();
  await page.getByRole("main").getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByText(`${sceneName} Renamed`, { exact: true }).first()).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByText(`${sceneName} Renamed`, { exact: true }).first()).toBeVisible();

  const browserEvidence = await page.evaluate(async ({ legacyKeys, stateKey, backupKey, sessionKey, databaseName, storeName, recordId }) => {
    const originalStorage = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
    const nightforgeStorage = {
      state: localStorage.getItem(stateKey),
      backup: localStorage.getItem(backupKey),
      session: sessionStorage.getItem(sessionKey),
    };
    const databaseRecord = await new Promise((resolvePromise, rejectPromise) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => rejectPromise(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeName, "readonly");
        const readRequest = transaction.objectStore(storeName).get(recordId);
        readRequest.onsuccess = () => {
          database.close();
          resolvePromise(readRequest.result);
        };
        readRequest.onerror = () => rejectPromise(readRequest.error);
      };
    });
    return { originalStorage, nightforgeStorage, databaseRecord, bodyText: document.body.innerText };
  }, {
    legacyKeys: FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS,
    stateKey: STORAGE_KEYS.state,
    backupKey: STORAGE_KEYS.backup,
    sessionKey: STORAGE_KEYS.session,
    databaseName: originalDatabase,
    storeName: originalStore,
    recordId: originalRecord.id,
  });

  assert.deepEqual(browserEvidence.originalStorage, expectedLegacy, "Original Roll30 LocalStorage sentinels changed.");
  assert.deepEqual(browserEvidence.databaseRecord, originalRecord, "The original Roll30 IndexedDB sentinel changed.");
  assert.ok(browserEvidence.nightforgeStorage.state, "Nightforge did not persist its newly forged records.");
  assert.ok(browserEvidence.nightforgeStorage.session, "Nightforge did not persist its isolated active context.");
  assert.notEqual(ARTWORK_DATABASE, originalDatabase, "Nightforge and original Roll30 artwork databases must be separate.");

  const malformedMarkers = ["Â", "Ã", "âˆ", "â€", "â€¦", "ï¿½", "�"]
    .filter((marker) => browserEvidence.bodyText.includes(marker));
  assert.deepEqual(malformedMarkers, [], `Visible text contains malformed UTF-8 markers: ${malformedMarkers.join(", ")}`);
  assert.deepEqual(pageErrors, [], `The deployed application raised page errors: ${pageErrors.join("; ")}`);
  assert.deepEqual(failedResponses, [], `The deployed application returned failed resources: ${failedResponses.join("; ")}`);

  if (screenshotArgument) {
    const screenshotPath = resolve(screenshotArgument);
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
  }

  console.log(JSON.stringify({
    status: "passed",
    url: targetUrl.href,
    base: expectedBase,
    assetCount: assetPaths.length,
    journey: ["fresh Library", "Forge Play", "Table", "Heroes", "Scene rename", "reload"],
    originalLocalStorageKeysPreserved: FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS.length,
    originalIndexedDbSentinelPreserved: true,
    nightforgeStatePersisted: true,
    malformedTextMarkers: 0,
    pageErrors: 0,
    failedResponses: 0,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
