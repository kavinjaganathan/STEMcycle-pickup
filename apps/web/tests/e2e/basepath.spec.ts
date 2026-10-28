import fs from "node:fs";
import path from "node:path";
import { E2E_STEM_DATA } from "../../playwright.config";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations } from "./helpers";

// This build runs under /STEM, exactly as it will at https://ftcoverdrive.org/STEM.
const OUTBOX = path.join(E2E_STEM_DATA, "outbox");
const mailTo = (to: string) =>
  fs.existsSync(OUTBOX)
    ? fs
        .readdirSync(OUTBOX)
        .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf8")))
        .find((m) => m.to === to)
    : undefined;

test("everything works under /STEM", async ({ page, request }) => {
  const broken: string[] = [];
  page.on("response", (r) => {
    if (r.url().startsWith("http://localhost:3101") && r.status() >= 400)
      broken.push(`${r.status()} ${r.url()}`);
  });

  // The app lives only under /STEM.
  expect((await request.get("/contact")).status()).toBe(404);

  await page.goto("/STEM");
  await expect(page.getByRole("heading", { name: "Donate your used textbooks." })).toBeVisible();
  await expectNoAxeViolations(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "StemCycle" })).toHaveAttribute("href", "/STEM");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Contact us" }),
  ).toHaveAttribute("href", "/STEM/contact");

  // Book a pickup through the real form (client fetches must include /STEM).
  const email = `ada-stem-${Date.now()}@example.com`;
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill("214-555-0100");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Frisco");
  await page.getByLabel("ZIP code").fill("75033");
  await page.getByLabel("Type of textbooks").selectOption("High School");
  await page.getByLabel("Approximate number of books").fill("25");
  await page.getByRole("radiogroup").locator("label").first().click();
  await page.getByRole("button", { name: "Schedule pickup" }).click();
  await expect(page.getByRole("heading", { name: /You're all set/ })).toBeVisible();

  // The emailed cancel link points at /STEM and works.
  await expect.poll(() => mailTo(email)).toBeTruthy();
  const cancelUrl = mailTo(email).text.match(/http\S+\/cancel\/\S+/)![0];
  expect(cancelUrl.startsWith("http://localhost:3101/STEM/cancel/")).toBe(true);
  await page.goto(cancelUrl);
  await page.getByRole("button", { name: "Yes, cancel my pickup" }).click();
  await expect(page.getByText("Your pickup is cancelled.")).toBeVisible();

  // Contact page shows the team website and sends messages.
  await page.goto("/STEM/contact");
  await expect(page.getByRole("link", { name: "ftcoverdrive.org" })).toHaveAttribute(
    "href",
    "https://ftcoverdrive.org",
  );
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(`ada-stem-contact-${Date.now()}@example.com`);
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Testing the contact form under /STEM.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Your message was sent/)).toBeVisible();

  // Protected pages redirect within /STEM; the admin area works end to end.
  await page.goto("/STEM/driver");
  await page.waitForURL("**/STEM/login");
  await page.goto("/STEM/admin");
  await page.waitForURL("**/STEM/admin/login");
  await page.getByLabel("Admin email").fill("admin@stemcycle.local");
  await page.getByLabel("Password").fill("stemcycle-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/STEM\/admin$/);
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
    "href",
    /^\/STEM\/api\/admin\/pickups\/export\?/,
  );
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Drivers" })
    .click();
  await expect(page.getByRole("article", { name: "Dana Driver" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/STEM/admin/login");

  expect(broken).toEqual([]);
});

test("private areas are marked noindex", async ({ request }) => {
  for (const p of ["/STEM/login", "/STEM/admin/login", "/STEM/signup", "/STEM/api/health"]) {
    expect((await request.get(p)).headers()["x-robots-tag"], p).toBe("noindex, nofollow");
  }
  expect((await request.get("/STEM")).headers()["x-robots-tag"]).toBeUndefined();
  expect(await (await request.get("/STEM/robots.txt")).text()).toContain("Disallow: /STEM/admin");
});

test("cross-site writes are blocked; the public site's own origin is allowed", async ({
  request,
}) => {
  const body = { token: "x".repeat(43), action: "lookup" };
  const evil = await request.post("/STEM/api/cancel", {
    headers: { Origin: "https://evil.example" },
    data: body,
  });
  expect(evil.status()).toBe(403);
  const own = await request.post("/STEM/api/cancel", {
    headers: { Origin: "http://localhost:3101" },
    data: body,
  });
  expect(own.status()).not.toBe(403);
});
