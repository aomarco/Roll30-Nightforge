import { expect, test } from "@playwright/test";

async function openFreshLibrary(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("button", { name: "Compendium" })).toBeVisible();
}

test("Compendium tab opens the library of rules", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Compendium" }).click();
  await expect(page.getByRole("heading", { name: "Compendium" })).toBeVisible();
  for (const shelf of ["Monsters", "Items", "Spells", "Classes", "Races", "Conditions"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${shelf}`) }).first()).toBeVisible();
  }
});

test("Monster folders drill down to a readable stat block", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Compendium" }).click();
  await page.getByRole("button", { name: /^Monsters/ }).click();
  await page.getByRole("button", { name: /^Aberration/ }).click();
  await page.getByRole("button", { name: /^Aboleth/ }).click();
  await expect(page.getByRole("heading", { name: "Aboleth" })).toBeVisible();
  await expect(page.locator(".nf-state-compendium-detail")).toContainText("Armour Class");
  await expect(page.locator(".nf-state-compendium-detail")).toContainText("Challenge");
});

test("Item folders drill down to a readable entry", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Compendium" }).click();
  await page.getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("button", { name: /^Weapons/ }).click();
  await page.getByRole("button", { name: /^Longsword/ }).click();
  await expect(page.getByRole("heading", { name: "Longsword" })).toBeVisible();
  await expect(page.locator(".nf-state-compendium-detail")).toContainText("Versatile");
});

test("Compendium search answers to a monster name", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Compendium" }).click();
  await page.getByLabel("Search the compendium").fill("Aboleth");
  await page.getByRole("button", { name: /^Aboleth/ }).first().click();
  await expect(page.getByRole("heading", { name: "Aboleth" })).toBeVisible();
});

test("Sage button is present and opens the chat bubble", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Ask the tabletop sage" }).click();
  await expect(page.getByLabel("Tabletop sage chat")).toBeVisible();
  await expect(page.getByLabel("Ask the sage")).toBeVisible();
  await expect(page.getByLabel("Provider address")).toHaveCount(0);
  await page.getByLabel("Key source").selectOption("opencode-go");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("roll30-nightforge-v1:ai-assistant") || "{}").baseUrl)).toBe("https://opencode.ai/zen/go/v1");
});
