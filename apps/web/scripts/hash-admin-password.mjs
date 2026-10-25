// Prints an ADMIN_PASSWORD_HASH value for the shared admin login.
// Usage: node scripts/hash-admin-password.mjs   (prompts; nothing is echoed or saved)
import { randomBytes, scrypt } from "node:crypto";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const muted = { on: false };
rl._writeToOutput = (s) => {
  if (!muted.on) process.stdout.write(s);
};

function ask(q) {
  return new Promise((resolve) => {
    rl.question(q, (a) => resolve(a));
    muted.on = true;
  });
}

const pw = await ask("Admin password (12+ characters): ");
muted.on = false;
process.stdout.write("\n");
const again = await ask("Repeat it: ");
muted.on = false;
process.stdout.write("\n");
rl.close();

if (pw !== again) {
  console.error("The passwords don't match.");
  process.exit(1);
}
if (pw.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => {
  if (err) throw err;
  console.log("\nADMIN_PASSWORD_HASH=" + `scrypt:16384:8:1:${salt.toString("base64")}:${key.toString("base64")}`);
});
