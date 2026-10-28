import { expect, test } from "./fixtures";
import { expectNoAxeViolations, signInAs } from "./helpers";

test("drivers pick from the set pickup times and see who covers each", async ({ page }, info) => {
  await signInAs(page, "Sam Driver");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Availability" })
    .click();
  await expect(page.getByRole("heading", { name: "When can you drive?" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Only the set Sunday times are offered (1, 2 and 3 PM in the dev data), not every hour.
  const sunday = page.getByRole("group", { name: /^Sunday/ }).nth(1);
  const dayName = (await sunday.getAttribute("aria-label"))!;
  await expect(sunday.getByRole("button")).toHaveCount(3);

  // Dana already covers Sunday afternoons; Sam joins one time (projects share one database).
  const label = info.project.name === "mobile" ? "1 – 2 PM" : "2 – 3 PM";
  const time = sunday.getByRole("button", { name: `${label} on ${dayName}` });
  await expect(time).toContainText("1 driver");
  await time.click();
  await expect(time).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save weekend" }).nth(1).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  const after = page
    .getByRole("group", { name: /^Sunday/ })
    .nth(1)
    .getByRole("button", { name: `${label} on ${dayName}` });
  await expect(after).toHaveAttribute("aria-pressed", "true");
  await expect(after).toContainText("2 drivers");
});
