import { expect, test } from "@playwright/test";
import { blockMapTiles, bookPickup, expectNoAxeViolations, signInAs } from "./helpers";

test.beforeEach(({ page }) => blockMapTiles(page));

test("admin fixes a pickup whose address couldn't be found", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  await bookPickup(page.request, { name: "Ada Unfindable", address_line: "Nowhere Rd" });
  await bookPickup(page.request, { name: "Ada Findable", address_line: "6100 Main St" });
  await signInAs(page, "Alex Admin");

  // Geocoding runs right after submission; reload until it has finished.
  const bad = page.getByRole("article", { name: "Pickup for Ada Unfindable" });
  await expect(async () => {
    await page.reload();
    await expect(bad.getByText("Location not found")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(
    page
      .getByRole("article", { name: "Pickup for Ada Findable" })
      .getByText(/Locating|Location not found|Check location/),
  ).toHaveCount(0);

  await bad.getByRole("button", { name: "Fix location" }).click();
  const dialog = page.getByRole("dialog", { name: /Fix location/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Pickup location map" })).toBeVisible();
  await expectNoAxeViolations(page);

  await dialog.getByLabel("Latitude").fill("33.1507");
  await dialog.getByLabel("Longitude").fill("-96.8236");
  await dialog.getByRole("button", { name: "Save pin location" }).click();
  await expect(dialog).toBeHidden();
  await expect(bad.getByText("Location not found")).toHaveCount(0);
});

test("depot coordinates can be looked up from the address", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  await signInAs(page, "Alex Admin");
  await page.goto("/admin/depots");
  await page.getByRole("button", { name: "Add depot" }).click();
  await page.getByLabel("Name").fill("Plano storage");
  await page.getByLabel("Address").fill("1 Legacy Dr, Plano TX 75024");
  await page.getByRole("button", { name: "Find coordinates from address" }).click();
  await expect(page.getByLabel("Latitude")).not.toHaveValue("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Plano storage" })).toBeVisible();
});
