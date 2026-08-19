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

function durableAttackScene() {
  const attacker = createManualToken({
    id: "durable-attacker",
    name: "Durable Attacker",
    position: { xPercent: 48, yPercent: 50 },
    inventory: [{ itemId: "dagger", quantity: 1 }],
    loadout: { mainHand: "dagger", offHand: null },
  });
  const target = createManualToken({
    id: "durable-target",
    name: "Durable Target",
    position: { xPercent: 50, yPercent: 50 },
    hp: 20,
    maxHp: 20,
  });
  return createSceneRecord({
    id: "scene-durable-attack",
    name: "Durable Attack Test",
    kind: "battle",
    blankCanvas: true,
    tokens: [attacker, target],
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: [attacker.id, target.id],
      initiatives: { [attacker.id]: 20, [target.id]: 10 },
      activeIndex: 0,
      round: 1,
      resources: { [attacker.id]: createTurnResources(attacker) },
      battleItems: [],
      ammoSpentByToken: {},
      ammunitionRecovered: false,
      winnerTokenId: null,
      log: [],
    },
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

async function settleLayout(page, { resetDocks = false } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".nf-state-busy")).toHaveCount(0);
  await page.evaluate(async () => {
    const finiteAnimations = document.getAnimations().filter((animation) =>
      Number.isFinite(animation.effect?.getComputedTiming?.().endTime));
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
  if (resetDocks) await resetTableDocks(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator(".nf-state-screen-root, .nf-state-table-root, .nf-state-scene-root").first()).toBeVisible();
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

async function expectEveryEnabledFormControlNamed(page) {
  const unnamed = await page.locator("input:not([disabled]), select:not([disabled]), textarea:not([disabled])").evaluateAll((controls) =>
    controls.flatMap((control) => {
      const ariaLabel = control.getAttribute("aria-label")?.trim();
      const labelledBy = (control.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .join(" ")
        .trim();
      const labels = [...(control.labels || [])].map((label) => label.textContent?.trim() || "").join(" ").trim();
      return ariaLabel || labelledBy || labels ? [] : [control.outerHTML.slice(0, 180)];
    }));
  expect(unnamed).toEqual([]);
}

test("managed-screen visual baselines remain deterministic", async ({ page }) => {
  const battle = sceneFixture();
  const play = sceneFixture({ kind: "play", name: "Quiet Embassy at the Edge of the Verdigris Expanse" });
  const hero = heroFixture();
  await open(page, { scenes: [battle, play], heroes: [hero] });

  await settleLayout(page);
  const forgeButton = page.getByRole("button", { name: "Forge a scene", exact: true });
  await forgeButton.click();
  await settleLayout(page);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await settleLayout(page);
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await settleLayout(page);
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await settleLayout(page);

  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: `Settings for ${battle.name}` }).click();
  await settleLayout(page);
  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: `Settings for ${play.name}` }).click();
  await settleLayout(page);
});

test("Table Setup, active Battle, selected, and nothing-selected baselines remain deterministic", async ({ page }) => {
  await open(page, { scenes: [sceneFixture()] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await settleLayout(page, { resetDocks: true });

  await open(page, { scenes: [sceneFixture({ empty: true, name: "Empty Nightforge Table" })] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await settleLayout(page, { resetDocks: true });

  await open(page, { scenes: [sceneFixture({ active: true })] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const lockedAdd = page.getByRole("button", { name: "Add to map", exact: true });
  await expect(lockedAdd).toBeDisabled();
  await expect(lockedAdd).toHaveCSS("opacity", "0.42");
  await expect(page.getByText(/Token and chest creation are locked/)).toBeVisible();
  await settleLayout(page, { resetDocks: true });
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

test("every enabled form control has a programmatic accessible name", async ({ page }) => {
  const scene = sceneFixture();
  await open(page, { scenes: [scene], heroes: [heroFixture()] });
  await expectEveryEnabledFormControlNamed(page);

  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await expectEveryEnabledFormControlNamed(page);
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  await expectEveryEnabledFormControlNamed(page);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expectEveryEnabledFormControlNamed(page);
  await page.keyboard.press("Escape");

  await page.getByRole("navigation").getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: `Settings for ${scene.name}` }).click();
  await expectEveryEnabledFormControlNamed(page);
  await page.locator(".crumb").click();
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await expectEveryEnabledFormControlNamed(page);
  await page.getByRole("button", { name: /Chest with \d+ items, use arrow keys to move/ }).click();
  await page.getByRole("button", { name: "Open chest inventory", exact: true }).click();
  await expectEveryEnabledFormControlNamed(page);
});

test("owned equipment records open from the keyboard without nested controls", async ({ page }) => {
  await open(page, { heroes: [heroFixture()] });
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.getByRole("button", { name: "Gear", exact: true }).click();
  const openItem = page.getByRole("button", { name: /^Open .+ equipment record$/ }).first();
  await openItem.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /.+/ })).toContainText("Equipment record");
});

test("focused Play, Setup, and active-Battle pieces move with arrow keys", async ({ page }) => {
  const storedPosition = (sceneId, entity, id) => page.evaluate(({ stateKey, sceneId: targetScene, entity: collection, id: targetId }) => {
    const envelope = JSON.parse(localStorage.getItem(stateKey));
    return envelope.scenes.find((scene) => scene.id === targetScene)[collection].find((item) => item.id === targetId).position;
  }, { stateKey: STORAGE_KEYS.state, sceneId, entity, id });

  const play = sceneFixture({ kind: "play", name: "Keyboard Play" });
  await open(page, { scenes: [play] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const playToken = page.getByRole("button", { name: new RegExp(`${LONG_NAME}, use arrow keys to move`) });
  const playBefore = await storedPosition(play.id, "tokens", "token-0");
  await playToken.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => storedPosition(play.id, "tokens", "token-0")).not.toEqual(playBefore);

  const setup = sceneFixture({ name: "Keyboard Setup" });
  await open(page, { scenes: [setup] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const setupChest = page.getByRole("button", { name: /Chest with \d+ items, use arrow keys to move/ });
  const chestBefore = await storedPosition(setup.id, "chests", "chest-phase11");
  await setupChest.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => storedPosition(setup.id, "chests", "chest-phase11")).not.toEqual(chestBefore);

  const battle = sceneFixture({ active: true, name: "Keyboard Battle" });
  await open(page, { scenes: [battle] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const activeToken = page.getByRole("button", { name: new RegExp(`${LONG_NAME}, use arrow keys to move`) });
  await activeToken.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate((stateKey) => {
    const envelope = JSON.parse(localStorage.getItem(stateKey));
    return envelope.scenes[0].encounter.resources["token-0"].movementSpent;
  }, STORAGE_KEYS.state)).toBe(5);
});

test("a rolled attack is durably saved before its cinematic can be interrupted", async ({ page }) => {
  const scene = durableAttackScene();
  await open(page, { scenes: [scene] });
  await page.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  const beforeRevision = await page.evaluate((stateKey) => JSON.parse(localStorage.getItem(stateKey)).revision, STORAGE_KEYS.state);
  await page.getByRole("button", { name: "Open Combat Commands", exact: true }).click();
  const commands = page.getByRole("dialog");
  await commands.getByRole("button", { name: /^Attack\b/ }).click();
  await commands.getByRole("button", { name: /Dagger/ }).click();
  await page.getByRole("button", { name: "Attack Durable Target", exact: true }).click();
  await expect(page.getByRole("status", { name: "Attack result" })).toBeVisible();

  const saved = await page.evaluate((stateKey) => {
    const envelope = JSON.parse(localStorage.getItem(stateKey));
    const persistedScene = envelope.scenes.find((entry) => entry.id === "scene-durable-attack");
    return {
      revision: envelope.revision,
      actionSpent: persistedScene.encounter.resources["durable-attacker"].actionSpent,
      logLength: persistedScene.encounter.log.length,
    };
  }, STORAGE_KEYS.state);
  expect(saved.revision).toBe(beforeRevision + 1);
  expect(saved.actionSpent).toBe(true);
  expect(saved.logLength).toBe(1);

  const context = page.context();
  await page.close();
  const restoredPage = await context.newPage();
  await restoredPage.goto("/");
  await restoredPage.evaluate(() => document.fonts.ready);
  await expect(restoredPage.getByText("Gathering your scenes…")).toHaveCount(0);
  await restoredPage.getByRole("main").getByRole("button", { name: "Enter the table", exact: true }).click();
  await expect(restoredPage.getByRole("button", { name: "Open Combat Commands", exact: true })).toContainText(/attack/i);
  await restoredPage.close();
});

test("pagehide flushes the final queued Hero draft", async ({ page }) => {
  await open(page, { heroes: [heroFixture()] });
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.getByLabel("Character name").fill("Pagehide-Safe Hero Name");
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect.poll(() => page.evaluate((stateKey) => {
    const envelope = JSON.parse(localStorage.getItem(stateKey));
    return envelope.heroes[0].name;
  }, STORAGE_KEYS.state)).toBe("Pagehide-Safe Hero Name");
});

test("another tab synchronizes newer Nightforge state into the current view", async ({ page }) => {
  const scene = sceneFixture({ name: "Before External Save" });
  await open(page, { scenes: [scene], heroes: [heroFixture()] });
  const secondPage = await page.context().newPage();
  await secondPage.goto("/");
  await secondPage.evaluate(() => document.fonts.ready);
  await expect(secondPage.locator(".nf-state-screen-root")).toBeVisible();
  await secondPage.getByRole("button", { name: `Settings for ${scene.name}` }).click();
  await secondPage.getByLabel("Map name").fill("After External Save");
  await secondPage.getByLabel("Map name").blur();
  await expect(page.getByText("After External Save", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Settings for After External Save" }).click();
  await page.getByLabel("Map name").fill("After Synchronized Follow-up");
  await page.getByLabel("Map name").blur();
  await expect(secondPage.getByLabel("Map name")).toHaveValue("After Synchronized Follow-up");

  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await secondPage.getByRole("button", { name: "Heroes", exact: true }).click();
  await secondPage.getByLabel("Character name").fill("Externally Synchronized Hero");
  await secondPage.getByLabel("Character name").blur();
  await expect(page.getByLabel("Character name")).toHaveValue("Externally Synchronized Hero");
  await secondPage.close();
});

test("Nightforge renders exclusively from bundled local fonts", async ({ page }) => {
  await open(page, { scenes: [sceneFixture()], heroes: [heroFixture()] });
  const result = await page.evaluate(() => ({
    remoteFonts: performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /fonts\.(?:googleapis|gstatic)\.com/.test(url)),
    family: getComputedStyle(document.querySelector(".nf-state-responsive-shell")).fontFamily,
    sansReady: document.fonts.check('14px "Nightforge Plus Jakarta Sans"'),
    serifReady: document.fonts.check('14px "Nightforge Fraunces"'),
    monoReady: document.fonts.check('500 14px "Nightforge IBM Plex Mono"', "0123456789"),
  }));
  expect(result.remoteFonts).toEqual([]);
  expect(result.family).toContain("Nightforge Plus Jakarta Sans");
  expect(result.sansReady).toBe(true);
  expect(result.serifReady).toBe(true);
  expect(result.monoReady).toBe(true);
});

test("a thrown child renders the top-level recovery surface and reload action", async ({ page }) => {
  await page.goto("/tests/error-boundary-harness.html");
  const recovery = page.getByRole("alert");
  await expect(recovery).toContainText("The forge lost its footing");
  await recovery.getByRole("button", { name: "Reload Nightforge" }).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.recoveryInvoked)).toBe("true");
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
    await settleLayout(page);
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
    await settleLayout(page);
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
    await settleLayout(page);
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
