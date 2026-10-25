import { expect, test } from "./fixtures";
import { blockMapTiles, bookPickup, expectNoAxeViolations, signInAs, type Slot } from "./helpers";

test.beforeEach(({ page }) => blockMapTiles(page));

const firstSaturday = (slots: Slot[]) =>
  slots.find((s) => new Date(`${s.slot_date}T12:00:00Z`).getUTCDay() === 6 && s.hour === 10);

test("bookings are routed automatically and the admin can reassign a stop", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "data-changing flow runs once");
  const slot = await bookPickup(page.request, { name: "Stop Alpha" }, firstSaturday);
  await bookPickup(page.request, { name: "Stop Beta", address_line: "1 Legacy Dr" }, firstSaturday);

  await signInAs(page, "Admin");
  // Nobody presses a button: the routing tick plans the weekend once bookings go quiet.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/admin/routing/${slot.slot_date}`);
        const w = await res.json();
        return w.days[0].plan?.routes.flatMap((r: { stops: { name: string }[] }) =>
          r.stops.map((s) => s.name),
        );
      },
      { timeout: 30_000 },
    )
    .toEqual(expect.arrayContaining(["Stop Alpha", "Stop Beta"]));

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Routes" }).click();
  await page.getByLabel("Weekend").selectOption(slot.slot_date);
  await expect(page.getByText(/Routes are up to date|Changes waiting/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Route map" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Both drivers are free at 10; pin Stop Alpha to Sam.
  const assign = page.getByLabel("Assign Stop Alpha to");
  const sam = await assign.locator("option", { hasText: "Sam Driver" }).getAttribute("value");
  await assign.selectOption(sam!);
  await expect(page.getByText("Assignment saved and routes re-planned.")).toBeVisible();
  const samRoute = page.getByRole("article", { name: "Route for Sam Driver" });
  await expect(samRoute.getByLabel("Assign Stop Alpha to")).toBeVisible();
  await expect(samRoute.getByText("Assigned")).toBeVisible();

  await page.getByRole("button", { name: "Re-run routing now" }).click();
  await expect(page.getByText("Routes re-planned.")).toBeVisible();
  await expect(samRoute.getByLabel("Assign Stop Alpha to")).toBeVisible();
});

test("the routing tick endpoint requires the cron secret", async ({ request }) => {
  expect((await request.post("/api/internal/routing/tick")).status()).toBe(401);
  const ok = await request.post("/api/internal/routing/tick", {
    headers: { Authorization: "Bearer e2e-cron-secret-0123456789" },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ ok: true });
});
