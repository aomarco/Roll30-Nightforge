import { expect, test } from "@playwright/test";

import { createSceneRecord } from "../src/domain/records.js";
import { createManualToken, createTurnResources, sceneViewport, setupPositionForCell } from "../src/domain/table.js";
import { createEmptyEnvelope, sealEnvelope, serializeEnvelope } from "../src/storage/envelope.js";
import { storageIdentity } from "../src/storage/constants.js";

const STORAGE_KEYS = storageIdentity("development").keys;
const NOW = "2026-08-24T12:00:00.000Z";
const viewport = sceneViewport(44);
const at = (column, row) => setupPositionForCell({ column, row }, viewport);

const makeTokens = ({ wounded = false } = {}) => {
  const scout = createManualToken({
    id: "scout", name: "Sky Scout", faction: "ally", position: at(2, 2), hp: wounded ? 8 : 20, maxHp: 20,
    strength: 100, skillProficiencies: ["athletics"], speeds: { walk: 30, fly: 60, swim: 20, climb: 15 },
    inventory: [{ itemId: "club", quantity: 1 }, { itemId: "potion-of-healing-common", quantity: 1 }],
    loadout: { mainHand: "club", offHand: null },
  });
  const guard = createManualToken({
    id: "guard", name: "Iron Guard", faction: "foe", position: at(3, 2), hp: 20, maxHp: 20,
    strength: 1, dexterity: 1, inventory: [{ itemId: "club", quantity: 1 }], loadout: { mainHand: "club", offHand: null },
  });
  return [scout, guard];
};

const sceneFixture = ({ active = false, wounded = false } = {}) => {
  const tokens = makeTokens({ wounded });
  return createSceneRecord({
    id: active ? "expansion-active" : "expansion-setup",
    name: active ? "Expansion Battle" : "Expansion Setup",
    kind: "battle",
    blankCanvas: true,
    tokens,
    encounter: active ? {
      version: 1, status: "active", initiativeOrder: tokens.map(({ id }) => id),
      initiatives: { scout: 20, guard: 10 }, activeIndex: 0, round: 2,
      surprisedTokenIds: [], resources: { scout: createTurnResources(tokens[0]) },
      battleItems: [], ammoSpentByToken: {}, winnerTokenId: null, log: [],
    } : null,
    createdAt: NOW, updatedAt: NOW, lastOpenedAt: NOW,
  }, { id: active ? "expansion-active" : "expansion-setup", now: NOW });
};

async function openFixture(page, scene) {
  const envelope = sealEnvelope({
    ...createEmptyEnvelope(NOW), revision: 20, scenes: [scene], lastActiveSceneId: scene.id,
  }, NOW);
  await page.addInitScript(({ stateKey, sessionKey, serialized, sceneId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(stateKey, serialized);
    sessionStorage.setItem(sessionKey, JSON.stringify({ activeSceneId: sceneId }));
  }, {
    stateKey: STORAGE_KEYS.state,
    sessionKey: STORAGE_KEYS.session,
    serialized: serializeEnvelope(envelope),
    sceneId: scene.id,
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Enter the table" }).click();
  await expect(page.locator(".nf-state-table-root")).toBeVisible();
  await expect(page.locator(".nf-state-busy")).toHaveCount(0);
}

const savedScene = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).scenes[0], STORAGE_KEYS.state);

test("Setup edits condition immunity and surprise, then paints difficult terrain", async ({ page }) => {
  await openFixture(page, sceneFixture());

  await page.getByRole("checkbox", { name: /Surprised in round one/i }).check();
  await page.getByRole("button", { name: "Poisoned", exact: true }).click();
  await expect.poll(async () => {
    const scene = await savedScene(page);
    return [scene.tokens[0].surprised, scene.tokens[0].conditionImmunities.includes("poisoned")];
  }).toEqual([true, true]);

  await page.getByRole("button", { name: "Paint terrain" }).click();
  const plane = page.locator(".nf-state-table-plane");
  const box = await plane.boundingBox();
  await page.mouse.click(box.x + 44 * 8.5, box.y + 44 * 5.5);
  await expect.poll(async () => (await savedScene(page)).difficultTerrain.length).toBe(1);
  await expect(page.locator(".nf-state-table-terrain > i")).toHaveCount(1);
});

test("Ready persists through its real command-bar targeting flow", async ({ page }) => {
  await openFixture(page, sceneFixture({ active: true }));
  await page.getByRole("button", { name: "Tactics", exact: true }).click();
  await page.getByRole("button", { name: /Ready Club/ }).click();
  await expect(page.getByRole("status")).toContainText("Readying Club");
  await page.getByRole("button", { name: "Ready against Iron Guard" }).click();
  await expect.poll(async () => (await savedScene(page)).tokens[0].readiedAction?.trigger).toBe("target-moves");
});

test("A healing potion heals, consumes the item, and spends the Action", async ({ page }) => {
  await openFixture(page, sceneFixture({ active: true, wounded: true }));
  await page.getByRole("button", { name: "Tactics", exact: true }).click();
  await page.getByRole("button", { name: /Potion of Healing.*Sky Scout/i }).click();
  await expect.poll(async () => {
    const scene = await savedScene(page);
    return {
      healed: scene.tokens[0].hp > 8,
      potion: scene.tokens[0].inventory.find((entry) => entry.itemId === "potion-of-healing-common")?.quantity || 0,
      action: scene.encounter.resources.scout.actionType,
    };
  }).toEqual({ healed: true, potion: 0, action: "potion" });
});

test("Movement mode selection and Grapple work from the command bar", async ({ page }) => {
  await openFixture(page, sceneFixture({ active: true }));
  await page.getByLabel("Movement mode").selectOption("fly");
  await expect.poll(async () => (await savedScene(page)).encounter.resources.scout.movementMode).toBe("fly");

  await page.getByRole("button", { name: "Tactics", exact: true }).click();
  await page.getByRole("button", { name: /^Grapple Athletics/ }).click();
  await expect(page.getByRole("status")).toContainText("choose an adjacent enemy");
  await page.getByRole("button", { name: "grapple Iron Guard" }).click();
  await expect.poll(async () => {
    const guard = (await savedScene(page)).tokens.find((token) => token.id === "guard");
    return [guard.conditions.includes("grappled"), guard.grappledById];
  }).toEqual([true, "scout"]);
});
