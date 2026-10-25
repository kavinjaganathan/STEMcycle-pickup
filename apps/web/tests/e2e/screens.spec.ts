import { test } from "@playwright/test";
import { blockMapTiles, bookPickup, signInAs } from "./helpers";

// Visual review only: SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const OUT = process.env.SCREENSHOTS_DIR ?? "test-results/screens";

test("capture screens", async ({ page }, info) => {
  if (process.env.SCREEN_WIDTH)
    await page.setViewportSize({ width: Number(process.env.SCREEN_WIDTH), height: 900 });
  await blockMapTiles(page);
  if (process.env.SCREEN_BOOK) {
    await bookPickup(page.request, { name: "Grace Hopper" });
    await bookPickup(page.request, { name: "Katherine Johnson", address_line: "1 Legacy Dr" });
    await page.waitForTimeout(6000); // let the routing tick plan them
  }
  const as = process.env.SCREEN_AS as Parameters<typeof signInAs>[1] | undefined;
  if (as) await signInAs(page, as);
  for (const path of (process.env.SCREEN_PATHS ?? "/").split(",")) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `${OUT}/${info.project.name}${process.env.SCREEN_WIDTH ?? ""}${path.replace(/\//g, "_")}.png`,
      fullPage: true,
    });
  }
});
