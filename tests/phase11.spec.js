import { expect, test } from "@playwright/test";

import { ITEM_CATALOG } from "../src/domain/catalog.js";
import { createHeroRecord, createSceneRecord } from "../src/domain/records.js";
import { createChest, createManualToken, createTurnResources } from "../src/domain/table.js";
import { createEmptyEnvelope, sealEnvelope, serializeEnvelope } from "../src/storage/envelope.js";
import { FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS, STORAGE_KEYS } from "../src/storage/constants.js";

const NOW = "2026-08-17T12:00:00.000Z";
const LONG_NAME = "The Last Sentinel of the Verdigris Archive and Keeper of the Unbroken Nightforge Oath";

const inventory = (limit = 48) => ITEM_CATALOG.slice(0, limit).map((item, index) => ({
  itemId: item.id,
  quantity: item.kind === "ammunition" ? item.bundleSize : index % 4 + 1,
}));

function heroFixture({ completeInventory = false } = {}) {
  return createHeroRecord({
    id: "hero-phase11",
    name: LONG_NAME,
    classId: "fighter",
    raceId: "half-elf",
    alignment: "Neutral Good",
    background: "Archivist of a deliberately long and storied ceremonial order",
    inventory: completeInventory ? inventory(ITEM_CATALOG.length) : inventory(),
  }, { now: NOW });
}

function tokenFixture(index, { long = false } = {}) {
  return createManualToken({
    id: `token-${index}`,
    ordinal: index,
    name: long ? LONG_NAME : `Combatant ${String(index + 1).padStart(3, "0")}`,
    type: index % 2 ? "enemy" : "ally",
    hp: 10 + index % 5,
    maxHp: 14,
    ac: 12 + index % 4,
    position: {
      xPercent: 5 + index % 12 * 7.5,
      yPercent: 8 + Math.floor(index / 12) % 9 * 9.5,
    },
    inventory: index === 0 ? [{ itemId: "dagger", quantity: 2 }, { itemId: "arrow", quantity: 20 }] : [],
    loadout: index === 0 ? { mainHand: "dagger", offHand: "dagger" } : { mainHand: null, offHand: null },
  });
}

function sceneFixture({ kind = "battle", active = false, tokens = 3, empty = false, name = LONG_NAME } = {}) {
  const tableTokens = empty ? [] : Array.from({ length: tokens }, (_, index) => tokenFixture(index, { long: index === 0 }));
  const first = tableTokens[0];
  const encounter = active ? {
    version: 1,
    status: "active",
    initiativeOrder: tableTokens.map((token) => token.id),
    initiatives: Object.fromEntries(tableTokens.map((token, index) => [token.id, 1000 - index])),
    activeIndex: 0,
    round: 12,
    resources: first ? { [first.id]: createTurnResources(first) } : {},
    battleItems: [],
    ammoSpentByToken: {},
    ammunitionRecovered: false,
    winnerTokenId: null,
    log: [],
  } : null;
  return createSceneRecord({
    id: active ? "scene-active" : kind === "play" ? "scene-play" : empty ? "scene-empty" : "scene-setup",
    name,
    kind,
    blankCanvas: true,
    tokens: tableTokens,
    chests: kind === "battle" && !empty
      ? [createChest({ id: "chest-phase11", position: { xPercent: 72, yPercent: 55 }, inventory: inventory(12) })]
      : [],
    encounter,
    createdAt: NOW,
    updatedAt: NOW,
    lastOpenedAt: NOW,
  }, { now: NOW });
}

async function seed(page, { scenes = [], heroes = [] } = {}) {
  const envelope = sealEnvelope({
    ...createEmptyEnvelope(NOW),
    revision: 11,
    scenes,
    heroes,
    lastActiveSceneId: scenes[0]?.id || null,
  }, NOW);
  await page.addInitScript(({ stateKey, backupKey, sessionKey, serialized, activeSceneId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(stateKey, serialized);
    localStorage.removeItem(backupKey);
    sessionStorage.setItem(sessionKey, JSON.stringify({ activeSceneId }));
  }, {
    stateKey: STORAGE_KEYS.state,
    backupKey: STORAGE_KEYS.backup,
    sessionKey: STORAGE_KEYS.session,
    serialized: serializeEnvelope(envelope),
    activeSceneId: scenes[0]?.id || null,
  });
}

async function open(page, fixture = {}) {
  await seed(page, fixture);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".nf-state-screen-root, .nf-state-table-root, .nf-state-scene-root").first()).toBeVisible();
  await expect(page.getByText("Gathering your scenes…")).toHaveCount(0);
  await expect(page.locator(".nf-state-busy")).toHaveCount(0);
}

async function waitForApp(page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".nf-state-screen-root, .nf-state-table-root, .nf-state-scene-root").first()).toBeVisible();
}

async function expectStableScreenshot(page, name, { resetDocks = false } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".nf-state-busy")).toHaveCount(0);
  await page.evaluate(async () => {
    const finiteAnimations = document.getAnimations().filter((animation) =>
      Number.isFinite(animation.effect?.getComputedTiming?.().endTime));
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
  if (resetDocks) await resetTableDocks(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page).toHaveScreenshot(name, { fullPage: true, animations: "disabled" });
}

async function resetTableDocks(page) {
  await page.locator(".dock-body").evaluateAll((docks) => {
    for (const dock of docks) {
      dock.scrollTop = 0;
      dock.scrollLeft = 0;
    }
  });
}

async function expectNoHardClip(page) {
  const audit = await page.evaluate(() => {
    const root = document.documentElement;
    const clipped = [...document.querySelectorAll("h1,h2,h3,.btn,.deck-tab,.tag,.cast-meta,.hud-scene,.track-name")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return element.getClientRects().length && element.scrollWidth > element.clientWidth + 1 &&
          style.overflowX === "hidden" && style.textOverflow !== "ellipsis";
      })
      .map((element) => element.textContent.trim().slice(0, 80));
    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      clipped,
    };
  });
  expect(audit.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(audit.clipped).toEqual([]);
}

test("managed-screen visual baselines remain deterministic", async ({ page }) => {
  const battle = sceneFixture();
  const play = sceneFixture({ kind: "play", name: "Quiet Embassy at the Edge of the Verdigris Expanse" });
  const hero = heroFixture();
  await open(page, { scenes: [battle, play], heroes: [hero] });

  await expectStableScreenshot(page, "library.png");
  const forgeButton = page.getByRole("button", { name: "Forge a scene", exact: true });
  await forgeButton.click();
  await expectStableScreenshot(page, "forge.png");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await expectStableScreenshot(page, "heroes-identity.png");
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await expectStableScreenshot(page, "heroes-abilities.png");
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await expectStableScreenshot(page, "heroes-gear.png");

  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: `Settings for ${battle.name}` }).click();
  await expectStableScreenshot(page, "scene-battle.png");
  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: `Settings for ${play.name}` }).click();
  await expectStableScreenshot(page, "scene-play.png");
});

test("Table Setup, active Battle, selected, and nothing-selected baselines remain deterministic", async ({ page }) => {
  await open(page, { scenes: [sceneFixture()] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await expectStableScreenshot(page, "table-setup-selected.png", { resetDocks: true });

  await open(page, { scenes: [sceneFixture({ empty: true, name: "Empty Nightforge Table" })] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await expectStableScreenshot(page, "table-nothing-selected.png", { resetDocks: true });

  await open(page, { scenes: [sceneFixture({ active: true })] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const lockedAdd = page.getByRole("button", { name: "Add to map", exact: true });
  await expect(lockedAdd).toBeDisabled();
  await expect(lockedAdd).toHaveCSS("opacity", "0.42");
  await expect(page.getByText(/Token and chest creation are locked/)).toBeVisible();
  await expectStableScreenshot(page, "table-battle.png", { resetDocks: true });
});

test("modal focus is trapped, Escape closes only that modal, and focus returns to its invoker", async ({ page }) => {
  await open(page);
  const invoker = page.getByRole("button", { name: "Forge a scene", exact: true });
  await invoker.focus();
  await invoker.click();
  const dialog = page.getByRole("dialog", { name: "Forge a scene" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("The Sunken Crypt…")).toBeFocused();

  const focusables = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled])");
  const count = await focusables.count();
  await focusables.nth(count - 1).focus();
  await page.keyboard.press("Tab");
  await expect(focusables.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(focusables.nth(count - 1)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(invoker).toBeFocused();
});

test("primary Library actions are keyboard reachable with a visible focus indicator", async ({ page }) => {
  await open(page, { scenes: [sceneFixture()] });
  await page.evaluate(() => document.activeElement?.blur());
  const visited = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      return {
        tagName: element.tagName,
        name: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent.trim().replace(/\s+/g, " "),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    if (active.tagName === "BODY") break;
    visited.push(active.name);
    expect(active.outlineStyle, `visible focus for ${active.name}`).toBe("solid");
    expect(Number.parseFloat(active.outlineWidth), `visible focus width for ${active.name}`).toBeGreaterThanOrEqual(2);
  }
  for (const expected of ["Roll30", "Library", "Heroes", "Scene", "Jump to the table", "Party roster", "Forge a scene"]) {
    expect(visited.some((name) => name.includes(expected)), `${expected} must be in the keyboard sequence`).toBe(true);
  }
});

test("destructive confirmations identify their exact target", async ({ page }) => {
  const scene = sceneFixture({ name: LONG_NAME });
  await open(page, { scenes: [scene] });
  await page.getByRole("button", { name: `Delete ${LONG_NAME}` }).click();
  const dialog = page.getByRole("dialog", { name: "Close this chapter?" });
  await expect(dialog).toContainText(LONG_NAME);
  await expect(dialog).toHaveAttribute("aria-describedby", "delete-scene-description");
});

test("fresh launch exposes honest disabled reasons and a successful Forge journey", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "The vault is ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveAttribute("title", /Choose or Forge a Scene/);
  await expect(page.getByRole("button", { name: "Enter the table", exact: true })).toHaveAttribute("title", /Choose or Forge a Scene/);

  await page.getByRole("button", { name: "Forge a scene", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Forge a scene" });
  await dialog.getByPlaceholder("The Sunken Crypt…").fill("A Fresh Phase Eleven Play Scene");
  await dialog.getByRole("button", { name: /^Play\b/ }).click();
  await dialog.getByRole("button", { name: "Forge scene", exact: true }).click();
  await expect(page.locator(".nf-state-table-root")).toBeVisible();
  await expect(page.getByText("A Fresh Phase Eleven Play Scene", { exact: true }).first()).toBeVisible();
});

test("damaged primary and backup saves visibly open a clean vault without overwriting evidence", async ({ page }) => {
  await page.addInitScript(({ stateKey, backupKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(stateKey, "{damaged-primary");
    localStorage.setItem(backupKey, "[]");
  }, { stateKey: STORAGE_KEYS.state, backupKey: STORAGE_KEYS.backup });
  await waitForApp(page);

  const recovery = page.getByRole("status");
  await expect(recovery).toContainText("Nightforge recovered safely");
  await expect(recovery).toContainText("a clean vault was opened without overwriting them");
  const raw = await page.evaluate(({ stateKey, backupKey }) => ({
    primary: localStorage.getItem(stateKey),
    backup: localStorage.getItem(backupKey),
  }), { stateKey: STORAGE_KEYS.state, backupKey: STORAGE_KEYS.backup });
  expect(raw).toEqual({ primary: "{damaged-primary", backup: "[]" });
});

test("LocalStorage quota failure is visible, actionable, and preserves the prior valid save", async ({ page }) => {
  await open(page);
  const before = await page.evaluate((stateKey) => localStorage.getItem(stateKey), STORAGE_KEYS.state);
  await page.getByRole("button", { name: "Forge a scene", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Forge a scene" });
  await dialog.getByPlaceholder("The Sunken Crypt…").fill("A Scene That Cannot Be Saved");
  await page.evaluate((stateKey) => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithQuotaFailure(key, value) {
      if (key === stateKey) throw new DOMException("Browser storage quota exceeded", "QuotaExceededError");
      return nativeSetItem.call(this, key, value);
    };
  }, STORAGE_KEYS.state);
  await dialog.getByRole("button", { name: "Forge scene", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("Nightforge browser storage is full");
  await expect(dialog.getByRole("alert")).toContainText("previous valid state remains intact");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate((stateKey) => localStorage.getItem(stateKey), STORAGE_KEYS.state)).toBe(before);
});

test("successful Nightforge operations leave every original Roll30 save identifier untouched", async ({ page }) => {
  const markers = Object.fromEntries(FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS.map((key, index) => [key, `legacy-marker-${index}`]));
  const envelope = sealEnvelope(createEmptyEnvelope(NOW), NOW);
  await page.addInitScript(({ markers: legacy, stateKey, serialized }) => {
    localStorage.clear();
    sessionStorage.clear();
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    localStorage.setItem(stateKey, serialized);
  }, { markers, stateKey: STORAGE_KEYS.state, serialized: serializeEnvelope(envelope) });
  await waitForApp(page);
  await page.getByRole("button", { name: "Forge a scene", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Forge a scene" });
  await dialog.getByPlaceholder("The Sunken Crypt…").fill("Isolated Nightforge Scene");
  await dialog.getByRole("button", { name: "Forge scene", exact: true }).click();
  await expect(page.locator(".nf-state-table-root")).toBeVisible();
  const after = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS);
  expect(after).toEqual(markers);
});

test("all required responsive viewport baselines avoid hard clipping", async ({ page }) => {
  const scene = sceneFixture({ name: LONG_NAME });
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1280, 800], [1180, 820], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await open(page, { scenes: [scene], heroes: [heroFixture()] });
    await expectNoHardClip(page);
    await expectStableScreenshot(page, `responsive-${width}x${height}.png`);
  }
});

test("100, 125, and 150 percent browser-zoom emulation retains readable text", async ({ browser }) => {
  const scene = sceneFixture({ name: LONG_NAME });
  for (const [zoom, scale, width, height] of [[100, 1, 1440, 900], [125, 1.25, 1152, 720], [150, 1.5, 960, 600]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      colorScheme: "dark",
      locale: "en-AU",
      timezoneId: "Australia/Sydney",
    });
    const page = await context.newPage();
    await open(page, { scenes: [scene], heroes: [heroFixture()] });
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio }));
    expect(metrics).toEqual({ width, height, deviceScaleFactor: scale });
    await expectNoHardClip(page);
    await expectStableScreenshot(page, `zoom-${zoom}.png`);
    await context.close();
  }
});

test("Table docks and turn controls remain above the map at compact and 150 percent layouts", async ({ browser }) => {
  const scene = sceneFixture({ active: true, tokens: 24, name: LONG_NAME });
  for (const [name, scale, width, height] of [["compact", 1, 1024, 768], ["zoom-150", 1.5, 960, 600]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      colorScheme: "dark",
      locale: "en-AU",
      timezoneId: "Australia/Sydney",
    });
    const page = await context.newPage();
    await open(page, { scenes: [scene] });
    await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
    await expectNoHardClip(page);
    for (const selector of [".dock-left", ".dock-right", ".track"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector} must remain rendered`).not.toBeNull();
      expect(box.x + box.width, `${selector} must stay within the viewport`).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height, `${selector} must stay within the viewport`).toBeLessThanOrEqual(height + 1);
    }
    await page.locator(".cast-row").nth(20).click();
    await expect(page.locator(".cast-row").nth(20)).toHaveClass(/on/);
    await expectStableScreenshot(page, `table-responsive-${name}.png`);
    await context.close();
  }
});

test("large inventories remain searchable and responsive with the complete catalog", async ({ page }) => {
  await open(page, { heroes: [heroFixture({ completeInventory: true })] });
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await expect(page.locator(".loot")).toHaveCount(ITEM_CATALOG.length);
  const search = page.getByPlaceholder("Search your inventory…");
  await search.fill("longsword");
  await expect(page.locator(".loot")).toHaveCount(1);
  await expectNoHardClip(page);
});

test("large active token lists scroll while dock controls remain clickable above the map", async ({ page }) => {
  const scene = sceneFixture({ active: true, tokens: 180, name: LONG_NAME });
  await open(page, { scenes: [scene] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await expect(page.locator(".track-order li")).toHaveCount(180);
  await expect(page.locator(".cast-row")).toHaveCount(180);
  await page.locator(".cast-row").nth(75).click();
  await expect(page.locator(".cast-row").nth(75)).toHaveClass(/on/);
  await expectNoHardClip(page);
});

test("reduced motion removes material animation while preserving status content", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await open(page, { scenes: [sceneFixture({ active: true })] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const durations = await page.evaluate(() => {
    const elements = [document.querySelector(".piece"), document.querySelector(".track"), document.querySelector(".hud")].filter(Boolean);
    return elements.map((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    });
  });
  const durationSeconds = (value) => value.split(",").map((entry) => {
    const text = entry.trim();
    return text.endsWith("ms") ? Number.parseFloat(text) / 1000 : Number.parseFloat(text);
  });
  expect(durations.every(({ animation, transition }) =>
    [...durationSeconds(animation), ...durationSeconds(transition)].every((value) => value <= 0.001))).toBe(true);
  await expect(page.getByText(/Round 12/)).toBeVisible();
  await context.close();
});
