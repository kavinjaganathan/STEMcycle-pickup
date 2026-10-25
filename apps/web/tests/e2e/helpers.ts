import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);

export async function expectNoAxeViolations(page: Page) {
  const { violations } = await axe(page).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Don't load OpenStreetMap's volunteer-run tile servers from automated tests. */
export async function blockMapTiles(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}

/** Local dev login (only available with the local database backend). */
export async function signInAs(page: Page, name: "Admin" | "Dana Driver" | "Sam Driver") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Sign in as ${name}`) }).click();
  await page.waitForURL(name === "Admin" ? "**/admin" : "**/driver");
}

/** Books a pickup through the public API and returns the slot it landed in. */
export async function bookPickup(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
  pick: (slots: Slot[]) => Slot | undefined = (slots) => slots[0],
) {
  const { slots } = (await (await request.get("/api/slots/available")).json()) as {
    slots: Slot[];
  };
  const slot = pick(slots);
  expect(slot, "a bookable slot").toBeTruthy();
  const res = await request.post("/api/pickups", {
    // Distinct client per booking so tests don't hit the per-IP rate limit.
    headers: {
      "X-Forwarded-For": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    data: {
      name: "Grace Hopper",
      email: `grace-${Date.now()}@example.com`,
      phone: "972-555-0199",
      address_line: "6100 Main St",
      city: "Frisco",
      zip: "75034",
      textbook_type: "high_school",
      book_count: "30",
      slot: `${slot!.slot_date}T${String(slot!.hour).padStart(2, "0")}`,
      notes: "",
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return slot!;
}

export type Slot = { slot_date: string; hour: number; remaining: number };
