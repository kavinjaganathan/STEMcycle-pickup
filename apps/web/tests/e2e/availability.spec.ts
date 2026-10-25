import { expect, test } from "./fixtures";
import { expectNoAxeViolations, signInAs, type Slot } from "./helpers";

test("a driver's hours become bookable slots", async ({ page }, info) => {
  await signInAs(page, "Sam Driver");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Availability" }).click();
  await expect(page.getByRole("heading", { name: "When can you drive?" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Sam has no Sunday hours in the seed. Add 4–6 PM on the second weekend's Sunday.
  const sunday = page.getByRole("group", { name: /^Sunday/ }).nth(1);
  const dayName = (await sunday.getAttribute("aria-label"))!;
  const hour = info.project.name === "mobile" ? 16 : 17; // projects share one database
  const label = hour === 16 ? "4 – 5 PM" : "5 – 6 PM";
  await sunday.getByRole("button", { name: `${label} on ${dayName}` }).click();
  await expect(sunday.getByRole("button", { name: `${label} on ${dayName}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save weekend" }).nth(1).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  const { slots } = (await (await page.request.get("/api/slots/available")).json()) as {
    slots: Slot[];
  };
  expect(slots.some((s) => new Date(`${s.slot_date}T12:00:00Z`).getUTCDay() === 0 && s.hour === hour)).toBe(true);

  await page.reload();
  await expect(
    page.getByRole("group", { name: /^Sunday/ }).nth(1).getByRole("button", { name: `${label} on ${dayName}` }),
  ).toHaveAttribute("aria-pressed", "true");
});
