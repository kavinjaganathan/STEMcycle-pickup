import fs from "node:fs";
import path from "node:path";
import { test as base, type BrowserContext } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Browser, Page } from "@playwright/test";

const E2E_DATA = path.resolve(__dirname, "../../.data/e2e");

/** Records request URLs from an extra browser context (e.g. a second user). */
export function recordContext(ctx: BrowserContext) {
  const urls: string[] = [];
  ctx.on("request", (r) => urls.push(r.url()));
  ctx.on("close", () => {
    fs.mkdirSync(E2E_DATA, { recursive: true });
    fs.appendFileSync(path.join(E2E_DATA, "urls.log"), urls.join("\n") + "\n");
  });
}

/** Every test records the URLs its browser requested; teardown checks them for PII. */
export const test = base.extend<{ recordUrls: void }>({
  recordUrls: [
    async ({ context }, use) => {
      const urls: string[] = [];
      context.on("request", (r) => urls.push(r.url()));
      await use();
      fs.mkdirSync(E2E_DATA, { recursive: true });
      fs.appendFileSync(path.join(E2E_DATA, "urls.log"), urls.join("\n") + "\n");
    },
    { auto: true },
  ],
});
