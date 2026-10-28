import fs from "node:fs";
import path from "node:path";
import { E2E_DATA } from "../../playwright.config";
import { expect, test } from "./fixtures";
import { expectNoAxeViolations } from "./helpers";

test("visitors see the pickup service and Contact Us, not driver or admin tools", async ({
  page,
}) => {
  for (const url of ["/", "/contact"]) {
    await page.goto(url);
    const nav = page.getByRole("navigation", { name: "Main" });
    // The team site's tabs, with StemCycle as the current one and a way back.
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Meet the Team",
      "Awards",
      "Alumni",
      "StemCycle",
    ]);
    await expect(nav.getByRole("link", { name: "StemCycle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "https://ftcoverdrive.org/",
    );
    await expect(nav.getByRole("link", { name: "Meet the Team" })).toHaveAttribute(
      "href",
      "https://ftcoverdrive.org/#team",
    );
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.filter((h) => /^\/(signup|drive|admin)/.test(h))).toEqual([]);
    await expect(page.getByText(/sign up to drive/i)).toHaveCount(0);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Contact us" }),
    ).toBeVisible();
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Donate your used textbooks." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule a pickup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You don't need an account" })).toBeVisible();
});

test("search engines are kept out of private areas", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const p of ["/admin", "/driver", "/signup", "/login"])
    expect(robots).toContain(`Disallow: ${p}`);
});

test("Contact Us validates and really sends the message", async ({ page }, info) => {
  await page.goto("/contact");
  await expect(page.getByRole("link", { name: "team@stemcycle.example" })).toHaveAttribute(
    "href",
    "mailto:team@stemcycle.example",
  );
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  const email = `ada-contact-${info.project.name}-${Date.now()}@example.com`;
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Do you pick up in Allen? I have about 60 books.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Your message was sent/)).toBeFocused();

  const dir = path.join(E2E_DATA, "outbox");
  const mail = fs
    .readdirSync(dir)
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .find((m) => m.replyTo === email);
  expect(mail).toMatchObject({ to: "team@stemcycle.example" });
  expect(mail.text).toContain("Do you pick up in Allen?");
});

for (const width of [375, 768, 1280]) {
  test(`pages fit a ${width}px screen without sideways scrolling`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "viewport set explicitly");
    await page.setViewportSize({ width, height: 900 });
    for (const url of [
      "/",
      "/contact",
      "/login",
      "/signup?invite=e2e-invite-0123",
      "/no-such-page",
    ]) {
      await page.goto(url);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${url} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}
