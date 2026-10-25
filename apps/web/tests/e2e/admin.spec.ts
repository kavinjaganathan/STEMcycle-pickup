import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { E2E_DATA } from "../../playwright.config";
import { bookPickup, expectNoAxeViolations, signInAs } from "./helpers";

test("admin filters pickups and exports CSV", async ({ page }) => {
  await bookPickup(page.request, { name: "Grace Hopper", textbook_type: "college" });
  await signInAs(page, "Admin");
  await expect(page.getByRole("heading", { name: "Pickups" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Pickup for Grace Hopper" }).first()).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByLabel("Textbooks").selectOption("elementary");
  await expect(page.getByRole("article", { name: "Pickup for Grace Hopper" })).toHaveCount(0);
  await page.getByLabel("Textbooks").selectOption("college");
  await expect(page.getByRole("article", { name: "Pickup for Grace Hopper" }).first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const file = await (await download).path();
  const csv = fs.readFileSync(file!, "utf8");
  expect(csv).toContain('"Textbook type"');
  expect(csv).toContain('"College/University"');
});

test("admin approves a pending driver, who gets an email", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "approval changes shared state; run once");
  await signInAs(page, "Admin");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Drivers" }).click();
  const pat = page.getByRole("article", { name: "Pat Pending" });
  await expect(pat).toBeVisible();
  await expectNoAxeViolations(page);
  await pat.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Pat Pending is approved and we emailed them/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Active drivers/ }).getByRole("article", { name: "Pat Pending" }),
  ).toBeVisible();

  const outbox = path.join(E2E_DATA, "outbox");
  const mail = fs
    .readdirSync(outbox)
    .map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), "utf8")))
    .find((m) => m.to === "driver3@stemcycle.local");
  expect(mail?.subject).toContain("approved to drive");
});

test("admin updates the depot in settings", async ({ page }, info) => {
  await signInAs(page, "Admin");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Depot name")).not.toHaveValue("");
  await expectNoAxeViolations(page);
  const name = `Frisco garage (${info.project.name})`;
  await page.getByLabel("Depot name").fill(name);
  await page.getByLabel("Latitude").fill("33.1497");
  await page.getByLabel("Longitude").fill("-96.8226");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Depot name")).toHaveValue(name);
});
