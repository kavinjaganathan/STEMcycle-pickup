import { expect, recordContext, test, type Browser } from "./fixtures";
import {
  blockMapTiles,
  bookPickup,
  expectNoAxeViolations,
  signInAs,
  type Slot,
} from "./helpers";

test.beforeEach(({ page }) => blockMapTiles(page));

async function newDriverPage(
  browser: Browser,
  name: "Dana Driver" | "Sam Driver",
  weekend: string,
  use: object,
) {
  const ctx = await browser.newContext(use);
  recordContext(ctx);
  const page = await ctx.newPage();
  await blockMapTiles(page);
  await signInAs(page, name);
  await page.goto(`/driver?weekend=${weekend}`);
  return { ctx, page };
}

test("drivers see only their own stops and mark them picked up, even offline", async ({
  page,
  browser,
  request,
}, info) => {
  test.skip(info.project.name !== "mobile", "driver flow runs on the phone layout");
  // The second Saturday: no other test books into it.
  const { slots } = (await (await request.get("/api/slots/available")).json()) as {
    slots: Slot[];
  };
  const saturdays = [...new Set(slots.map((s) => s.slot_date))].filter(
    (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 6,
  );
  const sat = saturdays[1];
  // 9 AM: only Dana is free; 1 PM: only Sam. The 11 AM and 12 PM stops are
  // assigned by the admin, which also exercises overrides.
  const plan: [string, number, "Dana Driver" | "Sam Driver" | null][] = [
    ["Stop Alpha", 9, null],
    ["Stop Bravo", 11, "Dana Driver"],
    ["Stop Charlie", 13, null],
    ["Stop Delta", 12, "Sam Driver"],
  ];
  await signInAs(page, "Admin");
  const { drivers } = await (await page.request.get("/api/admin/drivers")).json();
  const idOf = (n: string) => drivers.find((d: { full_name: string }) => d.full_name === n).id;
  for (const [i, [name, hour, pin]] of plan.entries()) {
    await bookPickup(
      request,
      {
        name,
        address_line: `${(i + 1) * 101} Cedar Ln`,
        book_count: "40",
        notes: i === 0 ? "Boxes behind the side gate" : "",
      },
      (all) => all.find((s) => s.slot_date === sat && s.hour === hour),
    );
    if (pin) {
      const { pickups } = await (
        await page.request.get(`/api/admin/pickups?from=${sat}&to=${sat}&status=pending,scheduled`)
      ).json();
      const id = pickups.find((x: { name: string }) => x.name === name).id;
      const res = await page.request.post(`/api/admin/pickups/${id}/assign`, {
        data: { driver_id: idOf(pin) },
      });
      expect(res.status()).toBe(200);
    }
  }

  const dana = await newDriverPage(browser, "Dana Driver", sat, info.project.use);
  const sam = await newDriverPage(browser, "Sam Driver", sat, info.project.use);
  // Routing runs on its own a moment after the bookings settle.
  await expect
    .poll(
      async () => {
        const w = await (await dana.page.request.get(`/api/driver/routes?weekend=${sat}`)).json();
        return w.days[0].routes.flatMap((r: { stops: unknown[] }) => r.stops).length;
      },
      { timeout: 30_000 },
    )
    .toBe(2);
  await dana.page.reload();
  await sam.page.reload();

  const danaStops = dana.page.getByRole("article", { name: /^Stop \d/ });
  const samStops = sam.page.getByRole("article", { name: /^Stop \d/ });
  await expect(danaStops).toHaveCount(2);
  await expect(samStops).toHaveCount(2);
  const danaText = (await danaStops.allInnerTexts()).join("\n");
  const samText = (await samStops.allInnerTexts()).join("\n");
  expect(danaText).toContain("Stop Alpha");
  expect(danaText).not.toContain("Stop Charlie");
  expect(samText).toContain("Stop Charlie");
  expect(samText).not.toContain("Stop Alpha");
  expect(danaText).not.toContain("@example.com"); // no resident emails for drivers

  const p = dana.page;
  await expect(p.getByText(/Tentative\./)).toBeVisible();
  await expectNoAxeViolations(p);
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const first = danaStops.first();
  await expect(first.getByText("Next stop")).toBeVisible();
  await expect(first.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir\/\?api=1&destination=3\d\.\d+,-9\d\.\d+/,
  );
  await expect(first.getByRole("link", { name: "Open in Apple Maps" })).toHaveAttribute(
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

  // The admin sees them as picked up.
  await page.goto("/admin");
  await page.getByRole("checkbox", { name: "Picked up" }).check();
  await expect(page.getByRole("article", { name: "Pickup for Stop Alpha" })).toContainText(
    "Picked up",
  );

  // Drivers can't use each other's stop ids.
  const w = await (await dana.page.request.get(`/api/driver/routes?weekend=${sat}`)).json();
  const res = await sam.page.request.post(`/api/driver/stops/${w.days[0].routes[0].stops[0].id}`, {
    data: { picked_up: false },
  });
  expect(res.status()).toBe(400);
  await dana.ctx.close();
  await sam.ctx.close();
});

test("the admin session can't use the driver API", async ({ page }) => {
  await signInAs(page, "Admin");
  expect((await page.request.get("/api/driver/routes?weekend=2030-01-05")).status()).toBe(401);
});
