import { expect, test } from "./fixtures";
import { expectNoAxeViolations } from "./helpers";

test("a new driver signs up, signs in and waits for approval", async ({ page }, info) => {
  const email = `newdriver-${info.project.name}-${Date.now()}@example.com`;
  await page.goto("/drive");
  await page.getByRole("link", { name: "Sign up to drive" }).click();
  await expectNoAxeViolations(page);

  await page.getByLabel("Full name").fill("Mae Jemison");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("214-555-0100");
  await page.getByLabel("Vehicle capacity (boxes)").fill("15");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Password: Use at least 10 characters.")).toBeVisible();
  await page.getByLabel("Password").fill("a good long password");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText(/Thanks for signing up!/)).toBeFocused();

  // Signing up again with the same email looks identical (no account probing).
  const again = await page.request.post("/api/auth/signup", {
    headers: { "X-Forwarded-For": "10.9.9.9" },
    data: {
      full_name: "Mae Jemison",
      email,
      phone: "2145550100",
      capacity_boxes: 15,
      password: "another long password",
    },
  });
  expect(again.status()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong password!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/Email or password is incorrect/)).toBeVisible();
  await page.getByLabel("Password").fill("a good long password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/driver");
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Pending drivers can't use driver tools.
  const res = await page.request.get("/api/driver/routes?weekend=2026-10-31");
  expect([403, 404]).toContain(res.status());

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Account" }).click();
  await expect(page.getByText("Waiting for admin approval")).toBeVisible();
  await page.getByLabel("Vehicle capacity (boxes)").fill("18");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.goto("/driver");
  await page.waitForURL("**/login");
});

test("the admin signs in with the shared login", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL("**/admin/login");
  await expectNoAxeViolations(page);
  await page.getByLabel("Admin email").fill("admin@stemcycle.local");
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByLabel("Password").fill("stemcycle-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Pickups" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/admin/login");
  expect((await page.request.get("/api/admin/settings")).status()).toBe(401);
});

test("drivers can't use the admin API, and forged admin cookies are rejected", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Sign in as Dana Driver/ }).click();
  await page.waitForURL("**/driver");
  expect((await page.request.get("/api/admin/settings")).status()).toBe(401);

  await context.addCookies([
    { name: "sc_admin", value: `${Date.now() + 3600_000}.forged`, url: page.url() },
  ]);
  expect((await page.request.get("/api/admin/settings")).status()).toBe(401);
});

test("admin login is rate limited", async ({ request }, info) => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await request.post("/api/admin/login", {
      headers: { "X-Forwarded-For": `10.66.66.${info.project.name === "mobile" ? 1 : 2}` },
      data: { email: "admin@stemcycle.local", password: `guess-${i}` },
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
  expect(statuses[5]).toBe(429);
});
