import { expect, test } from "@playwright/test";
import { bookPickup, expectNoAxeViolations, signInAs } from "./helpers";

test.describe("access control", () => {
  test("anonymous users are sent to login and the API refuses them", async ({ page, request }) => {
    await page.goto("/admin");
    await page.waitForURL("**/login");
    expect((await request.get("/api/admin/pickups?from=2026-01-01&to=2026-12-31")).status()).toBe(
      401,
    );
    expect(
      (await request.get("/api/admin/pickups/export?from=2026-01-01&to=2026-12-31")).status(),
    ).toBe(401);
  });

  test("drivers can't use the admin dashboard or API", async ({ page }) => {
    await signInAs(page, "Dana Driver");
    await page.goto("/admin");
    await page.waitForURL("**/driver");
    const res = await page.request.get("/api/admin/vehicles");
    expect(res.status()).toBe(403);
  });
});

test("admin manages pickups and exports CSV", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  await bookPickup(page.request, { name: "Grace Hopper" });
  await signInAs(page, "Alex Admin");

  const card = page.getByRole("article", { name: "Pickup for Grace Hopper" }).first();
  await expect(card).toBeVisible();
  await expectNoAxeViolations(page);

  await card.getByRole("button", { name: "Mark picked up" }).click();
  await expect(page.getByRole("article", { name: "Pickup for Grace Hopper" })).toHaveCount(0);

  await page.getByLabel("Picked up").check();
  await expect(card.getByText("Picked up", { exact: true })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const csv = await (await download).createReadStream();
  const text = await new Promise<string>((resolve) => {
    let s = "";
    csv.on("data", (c) => (s += c));
    csv.on("end", () => resolve(s));
  });
  expect(text).toContain('"Date","Window","Status"');
  expect(text).toContain("Grace Hopper");
});

test("admin adds pickup windows and a vehicle", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  await signInAs(page, "Alex Admin");

  await page.getByRole("link", { name: "Windows" }).click();
  await page.getByLabel("First date").fill("2030-03-01");
  await page.getByLabel("Last date").fill("2030-03-31");
  await page.getByLabel("Starts").fill("10:00");
  await page.getByLabel("Ends").fill("13:00");
  await page.getByRole("button", { name: "Add windows" }).click();
  await expect(page.getByText("Added 5 pickup windows.")).toBeVisible(); // Saturdays in March 2030
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "Vehicles" }).click();
  await page.getByRole("button", { name: "Add vehicle" }).click();
  await page.getByLabel("Name").fill("Big Van");
  await page.getByLabel("Type").fill("Cargo van");
  await page.getByLabel("Capacity (books)").fill("900");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: /Big Van/ })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("admin pages are accessible and fit on a phone", async ({ page }) => {
  await signInAs(page, "Alex Admin");
  for (const path of [
    "/admin/slots",
    "/admin/vehicles",
    "/admin/depots",
    "/admin/team",
    "/admin/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoAxeViolations(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls horizontally`).toBe(false);
  }
});
