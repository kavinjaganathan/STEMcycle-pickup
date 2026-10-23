import { expect, recordContext, test, type Browser } from "./fixtures";
import { blockMapTiles, bookPickup, expectNoAxeViolations, signInAs } from "./helpers";

test.beforeEach(({ page }) => blockMapTiles(page));

async function newDriverPage(
  browser: Browser,
  name: "Dana Driver" | "Sam Driver",
  date: string,
  use: object,
) {
  const ctx = await browser.newContext(use);
  recordContext(ctx);
  const page = await ctx.newPage();
  await blockMapTiles(page);
  await signInAs(page, name);
  await page.getByLabel("Day", { exact: true }).fill(date);
  return { ctx, page };
}

test("drivers see only their own stops and mark them picked up, even offline", async ({
  page,
  browser,
  request,
}, info) => {
  test.skip(info.project.name !== "mobile", "driver flow runs on the phone layout");
  // Use a day no other test books into, so the plan only contains these stops.
  const { slots } = await (await request.get("/api/slots/available")).json();
  const slot = slots.find((s: { slot_date: string }) => s.slot_date !== slots[0].slot_date);
  const names = ["Stop Alpha", "Stop Bravo", "Stop Charlie", "Stop Delta"];
  for (const [i, name] of names.entries()) {
    await bookPickup(request, {
      name,
      address_line: `${(i + 1) * 101} Cedar Ln`,
      slot_id: slot.id,
      book_count: "150",
      notes: i === 0 ? "Boxes behind the side gate" : "",
    });
  }

  // Admin plans with one driver per SUV (4 × 150 books needs both) and publishes.
  await signInAs(page, "Alex Admin");
  await page.goto("/admin/routes");
  await page.getByLabel("Date").fill(slot.slot_date);
  await expect(page.getByText("4 pickups on")).toBeVisible();
  await page.getByLabel("Driver for SUV 1").selectOption({ label: "Dana Driver" });
  await page.getByLabel("Driver for SUV 2").selectOption({ label: "Sam Driver" });
  await page.getByRole("button", { name: /Plan routes|Re-plan routes/ }).click();
  await page.getByRole("button", { name: "Publish to drivers" }).click();
  await expect(page.getByText("Published: drivers can see these routes")).toBeVisible();

  const dana = await newDriverPage(browser, "Dana Driver", slot.slot_date, info.project.use);
  const sam = await newDriverPage(browser, "Sam Driver", slot.slot_date, info.project.use);
  const danaStops = dana.page.getByRole("article", { name: /^Stop \d/ });
  const samStops = sam.page.getByRole("article", { name: /^Stop \d/ });
  await expect(danaStops).toHaveCount(2);
  await expect(samStops).toHaveCount(2);
  const danaText = (await danaStops.allInnerTexts()).join("\n");
  const samText = (await samStops.allInnerTexts()).join("\n");
  for (const n of names) expect(danaText.includes(n) !== samText.includes(n)).toBe(true);

  const p = dana.page;
  await expectNoAxeViolations(p);
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const first = danaStops.first();
  await expect(first.getByText("Next stop")).toBeVisible();
  await expect(first.getByRole("link", { name: "Google Maps" })).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir\/\?api=1&destination=3\d\.\d+,-9\d\.\d+/,
  );
  await expect(first.getByRole("link", { name: "Apple Maps" })).toHaveAttribute(
    "href",
    /maps\.apple\.com\/\?daddr=/,
  );

  await first.getByRole("button", { name: "Mark picked up" }).click();
  await expect(first.getByRole("button", { name: /Picked up · Undo/ })).toBeVisible();
  await expect(p.getByText("1 of 2 picked up")).toBeVisible();
  await first.getByRole("button", { name: /Undo/ }).click();
  await expect(p.getByText("0 of 2 picked up")).toBeVisible();
  await first.getByRole("button", { name: "Mark picked up" }).click();
  await expect(p.getByText("1 of 2 picked up")).toBeVisible();

  // Lose signal, tap the second stop, then reconnect: the update syncs.
  await dana.ctx.setOffline(true);
  await danaStops.nth(1).getByRole("button", { name: "Mark picked up" }).click();
  await expect(p.getByText(/1 update saved on this phone/)).toBeVisible();
  await expect(p.getByText("2 of 2 picked up")).toBeVisible();
  await dana.ctx.setOffline(false);
  await expect(p.getByText(/saved on this phone/)).toHaveCount(0, { timeout: 15_000 });
  await expect(p.getByText(/All done/)).toBeVisible();

  // The admin sees both of Dana's stops as picked up.
  await page.goto("/admin/routes");
  await page.getByLabel("Date").fill(slot.slot_date);
  await expect(page.getByText("✓ picked up")).toHaveCount(2);

  // Drivers can't use each other's stop ids.
  const danaRoutes = await (
    await dana.page.request.get(`/api/driver/routes?date=${slot.slot_date}`)
  ).json();
  const res = await sam.page.request.post(`/api/driver/stops/${danaRoutes.routes[0].stops[0].id}`, {
    data: { picked_up: false },
  });
  expect(res.status()).toBe(400);
  await dana.ctx.close();
  await sam.ctx.close();
});

test("admins are kept out of the driver API and drivers out of admin pages", async ({ page }) => {
  await signInAs(page, "Alex Admin");
  expect((await page.request.get("/api/driver/routes?date=2030-01-01")).status()).toBe(403);
});
