import { test } from "@playwright/test";
import { bookPickup, signInAs } from "./helpers";

// Visual review only: SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const OUT = process.env.SCREENSHOTS_DIR ?? "test-results/screens";

test("capture screens", async ({ page }, info) => {
  await bookPickup(page.request, { name: "Grace Hopper" });
  await bookPickup(page.request, {
    name: "Katherine Johnson",
    address_line: "1 Legacy Dr",
    city: "Plano",
    zip: "75024",
    book_count: "80",
    notes: "Boxes by garage",
  });
  await signInAs(page, "Alex Admin");
  for (const path of (
    process.env.SCREEN_PATHS ?? "/admin,/admin/slots,/admin/vehicles,/admin/settings"
  ).split(",")) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `${OUT}/${info.project.name}${path.replace(/\//g, "_")}.png`,
      fullPage: true,
    });
  }
});
