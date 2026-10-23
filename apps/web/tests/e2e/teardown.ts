import fs from "node:fs";
import path from "node:path";

const E2E_DATA = path.resolve(__dirname, "../../.data/e2e");

// Personal details used by the e2e tests. None may appear in server logs or URLs.
const PII = [
  "@example.com",
  "Lovelace",
  "Hopper",
  "Unfindable",
  "Mae Jemison",
  "Stop Alpha",
  "214-555-0100",
  "2145550100",
  "9725550199",
  "972-555-0199",
  "6100 Main St",
  "Nowhere Rd",
  "Cedar Ln",
  "Main+St",
  "Main%20St",
];

export default function teardown() {
  const problems: string[] = [];
  for (const file of ["server.log", "urls.log"]) {
    const p = path.join(E2E_DATA, file);
    if (!fs.existsSync(p)) {
      problems.push(`${file} is missing`);
      continue;
    }
    const text = fs.readFileSync(p, "utf8");
    for (const needle of PII) {
      const i = text.indexOf(needle);
      if (i >= 0)
        problems.push(`${file} contains "${needle}": …${text.slice(Math.max(0, i - 80), i + 40)}…`);
    }
  }
  if (problems.length) throw new Error(`PII leak check failed:\n${problems.join("\n")}`);
}
