import { expect, test } from "@playwright/test";

async function openFreshLibrary(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
}

test("Backups page scrolls from top to bottom", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Backups" }).click();
  const scroller = page.locator(".nf-state-backups-root");
  await expect(scroller).toBeVisible();
  const overflow = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeGreaterThan(200);
  await scroller.hover();
  await page.mouse.wheel(0, 2000);
  await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
});

test("Compendium entries sit inside a real scroll container", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByRole("button", { name: "Compendium" }).click();
  const scroller = page.locator(".nf-state-compendium-root");
  await expect(scroller).toBeVisible();
  const overflowY = await scroller.evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflowY).toBe("auto");
});
