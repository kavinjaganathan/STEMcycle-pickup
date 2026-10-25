import { test } from "@playwright/test";
import { signInAs } from "./helpers";

// Visual review only: SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const OUT = process.env.SCREENSHOTS_DIR ?? "test-results/screens";

test("capture screens", async ({ page }, info) => {
  const as = process.env.SCREEN_AS as Parameters<typeof signInAs>[1] | undefined;
  if (as) await signInAs(page, as);
  for (const path of (process.env.SCREEN_PATHS ?? "/").split(",")) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `${OUT}/${info.project.name}${path.replace(/\//g, "_")}.png`,
      fullPage: true,
    });
  }
});
