import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard: log() calls must not pass personal fields. (lib/logger.ts also
 * redacts at runtime; this catches mistakes before they ship.)
 */
const ROOTS = ["lib", "app", "components"];
const PII = /\b(address_line|address|email|phone|notes|full_name|\.name|street)\b/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

describe("logging", () => {
  it("never passes personal fields to log()", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => files(path.resolve(r)))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/\blog\(\s*"(?:info|warn|error)"[\s\S]*?\);/g)) {
        if (PII.test(m[0]))
          offenders.push(`${path.relative(process.cwd(), file)}: ${m[0].replace(/\s+/g, " ")}`);
      }
      if (
        /console\.(log|info|warn|error)\(/.test(src) &&
        !file.endsWith(path.join("lib", "logger.ts"))
      ) {
        offenders.push(`${path.relative(process.cwd(), file)}: uses console directly`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
