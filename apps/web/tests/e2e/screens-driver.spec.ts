import { expect, test } from "@playwright/test";
import { bookPickup, signInAs } from "./helpers";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

test("capture driver view", async ({ page, browser, request }, info) => {
  test.skip(info.project.name !== "mobile");
  const { slots } = await (await request.get("/api/slots/available")).json();
  const slot = slots[4];
  for (const [i, n] of ["Ada Park", "Ben Cho", "Cy Diaz"].entries()) {
    await bookPickup(request, {
      name: n,
      address_line: `${(i + 3) * 88} Maple Ave`,
      slot_id: slot.id,
      book_count: "45",
      notes: i === 1 ? "Boxes on the porch bench" : "",
    });
  }
  await signInAs(page, "Alex Admin");
  await page.goto("/admin/routes");
  await page.getByLabel("Date").fill(slot.slot_date);
  await page.getByLabel("Driver for SUV 1").selectOption({ label: "Dana Driver" });
  await page.getByRole("button", { name: /Plan routes|Re-plan/ }).click();
  await page.getByRole("button", { name: "Publish to drivers" }).click();
  await expect(page.getByText(/Published/)).toBeVisible();

  const ctx = await browser.newContext(info.project.use);
  const d = await ctx.newPage();
  await signInAs(d, "Dana Driver");
  await d.getByLabel("Day", { exact: true }).fill(slot.slot_date);
  await d.getByRole("article").first().getByRole("button", { name: "Mark picked up" }).click();
  await expect(d.getByText("1 of 3 picked up")).toBeVisible();
  await d.screenshot({
    path: `${process.env.SCREENSHOTS_DIR ?? "test-results/screens"}/driver.png`,
    fullPage: true,
  });
});
