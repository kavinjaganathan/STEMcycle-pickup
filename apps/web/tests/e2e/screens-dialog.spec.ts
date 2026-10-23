import { expect, test } from "@playwright/test";
import { bookPickup, signInAs } from "./helpers";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

test("capture fix-location dialog", async ({ page }, info) => {
  await bookPickup(page.request, { name: "Zed Unfindable", address_line: "Main Street" });
  await signInAs(page, "Alex Admin");
  const card = page.getByRole("article", { name: "Pickup for Zed Unfindable" }).first();
  await expect(async () => {
    await page.reload();
    await expect(card.getByRole("button", { name: "Fix location" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await card.getByRole("button", { name: "Fix location" }).click();
  await page.waitForTimeout(2500); // tiles
  await page.screenshot({
    path: `${process.env.SCREENSHOTS_DIR ?? "test-results/screens"}/${info.project.name}_dialog.png`,
  });
});
