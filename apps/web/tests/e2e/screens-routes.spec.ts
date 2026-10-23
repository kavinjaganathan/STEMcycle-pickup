import { expect, test } from "@playwright/test";
import { bookPickup, signInAs } from "./helpers";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

test("capture route planner", async ({ page }, info) => {
  const slot = await bookPickup(page.request, { name: "Mae Jemison", address_line: "10 Elm St" });
  for (const [i, n] of [
    "Sally Ride",
    "Ellen Ochoa",
    "Chien-Shiung Wu",
    "Mary Jackson",
    "Dorothy Vaughan",
  ].entries()) {
    await bookPickup(page.request, {
      name: n,
      address_line: `${(i + 2) * 37} Oak St`,
      slot_id: slot.id,
      book_count: String(40 + i * 30),
    });
  }
  await signInAs(page, "Alex Admin");
  await page.goto("/admin/routes");
  await page.getByLabel("Date").fill(slot.slot_date);
  await page.getByRole("button", { name: /Plan routes|Re-plan/ }).click();
  await expect(page.getByText(/Draft: not visible/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: `${process.env.SCREENSHOTS_DIR ?? "test-results/screens"}/${info.project.name}_routes.png`,
    fullPage: true,
  });
});
