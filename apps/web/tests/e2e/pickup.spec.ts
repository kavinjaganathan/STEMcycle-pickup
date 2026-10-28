import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./fixtures";
import { E2E_DATA } from "../../playwright.config";
import { axe } from "./helpers";

const OUTBOX = path.join(E2E_DATA, "outbox");

function latestEmailTo(address: string): { subject: string; text: string } | undefined {
  if (!fs.existsSync(OUTBOX)) return undefined;
  return fs
    .readdirSync(OUTBOX)
    .sort()
    .reverse()
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf8")))
    .find((m) => m.to === address);
}

async function fillForm(page: Page, email: string) {
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("214-555-0100");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Frisco");
  await page.getByLabel("ZIP code").fill("75033");
  await page.getByLabel("Type of textbooks").selectOption("High School");
  await page.getByLabel("Approximate number of books").fill("25");
  // Second day, first hour: exercises switching days in the slot picker.
  // (Radios are visually hidden inside their labels, so click the labels like a person.)
  await page.getByRole("group", { name: "Day" }).locator("label").nth(1).click();
  await page.getByRole("radiogroup").locator("label").first().click();
  await expect(page.getByRole("radiogroup").getByRole("radio").first()).toBeChecked();
}

test("resident books a pickup, gets an email, and cancels it", async ({ page }, info) => {
  const email = `ada+${info.project.name}-${Date.now()}@example.com`;
  await page.goto("/");
  await fillForm(page, email);
  await page.getByRole("button", { name: "Schedule pickup" }).click();

  await expect(page.getByRole("heading", { name: /You're all set/ })).toBeFocused();
  await expect(page.getByText(/We'll come by (Saturday|Sunday)/)).toBeVisible();
  await expect(
    page.getByText("We've emailed you a confirmation with a link to cancel."),
  ).toBeVisible();

  await expect.poll(() => latestEmailTo(email)).toBeTruthy();
  const cancelUrl = latestEmailTo(email)!.text.match(/http\S+\/cancel\/\S+/)![0];

  await page.goto(cancelUrl);
  // The token is in the path: this page must never send a Referer.
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page.getByText(/Your pickup is scheduled for/)).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Yes, cancel my pickup" }).click();
  await expect(page.getByText("Your pickup is cancelled.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("This pickup was already cancelled.")).toBeVisible();
});

test("shows accessible validation errors", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Schedule pickup" }).click();

  const summary = page.locator("form").getByRole("alert");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Please fix the highlighted fields.");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Please enter a valid email address.").first()).toBeVisible();
});

test("rejects addresses outside the service area", async ({ page }) => {
  await page.goto("/");
  await fillForm(page, "far@example.com");
  await page.getByLabel("ZIP code").fill("73301");
  await page.getByRole("button", { name: "Schedule pickup" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("we only pick up in Frisco");
});

test("home page has no axe violations and no horizontal scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radiogroup")).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("only the set weekend pickup times are offered", async ({ request }) => {
  const { slots } = await (await request.get("/api/slots/available")).json();
  expect(slots.length).toBeGreaterThan(0);
  // Dev data: Saturday 9 AM to 2 PM, Sunday 1 to 4 PM.
  const times: Record<number, number[]> = { 6: [9, 10, 11, 12, 13], 0: [13, 14, 15] };
  for (const s of slots as { slot_date: string; hour: number }[]) {
    const day = new Date(`${s.slot_date}T12:00:00Z`).getUTCDay();
    expect(times[day]).toContain(s.hour);
  }
});

test("an invalid cancel link explains itself", async ({ page }) => {
  await page.goto(`/cancel/${"x".repeat(43)}`);
  await expect(page.getByText(/isn't valid/)).toBeVisible();
});
