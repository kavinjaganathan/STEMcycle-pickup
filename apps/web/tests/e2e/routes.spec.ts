import { expect, test } from "@playwright/test";
import { blockMapTiles, bookPickup, expectNoAxeViolations, signInAs } from "./helpers";

test.beforeEach(({ page }) => blockMapTiles(page));

test("admin plans, reviews and publishes routes", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  const slot = await bookPickup(page.request, { name: "Route One", address_line: "100 Elm St" });
  await bookPickup(page.request, {
    name: "Route Two",
    address_line: "200 Oak St",
    slot_id: slot.id,
  });
  await bookPickup(page.request, {
    name: "Route Three",
    address_line: "300 Pine St",
    slot_id: slot.id,
    book_count: "120",
  });

  await signInAs(page, "Alex Admin");
  await page.getByRole("link", { name: "Routes" }).click();
  await page.getByLabel("Date").fill(slot.slot_date);
  await expect(page.getByText(/pickups? on/)).toBeVisible();

  await page.getByRole("button", { name: /Plan routes|Re-plan routes/ }).click();
  await expect(page.getByText("Draft: not visible to drivers yet")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/planned with the backup planner/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Map of planned routes" })).toBeVisible();
  for (const name of ["Route One", "Route Two", "Route Three"]) {
    await expect(page.getByText(new RegExp(`ETA .* · ${name} ·`))).toBeVisible();
  }
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish to drivers" }).click();
  await expect(page.getByText("Published: drivers can see these routes")).toBeVisible();

  await page.getByRole("link", { name: "Pickups" }).click();
  await expect(
    page.getByRole("article", { name: "Pickup for Route One" }).getByText("Scheduled"),
  ).toBeVisible();
});
