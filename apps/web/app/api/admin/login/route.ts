import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { checkAdminCredentials, startAdminSession } from "@/lib/auth/admin";
import { getRepo } from "@/lib/db";
import { log } from "@/lib/logger";
import { clientIp, rateKey } from "@/lib/security";

const schema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const repo = await getRepo();
    const ip = clientIp(request.headers);
    // Tight limits: one shared account is a valuable target.
    const ok =
      (await repo.rateLimitHit(rateKey("admin-login-ip", ip), 900, 5)) &&
      (await repo.rateLimitHit("admin-login-all", 900, 30));
    if (!ok) return json({ error: "Too many attempts. Please wait 15 minutes." }, 429);
    const { email, password } = await parseBody(request, schema);
    if (!(await checkAdminCredentials(email, password))) {
      log("warn", "admin_login_failed");
      return json({ error: "Email or password is incorrect." }, 400);
    }
    await startAdminSession();
    log("info", "admin_login");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
