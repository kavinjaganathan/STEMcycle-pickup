import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { supabaseServer } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp, rateKey } from "@/lib/security";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

export async function POST(request: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.rateLimitHit(rateKey("magic-ip", clientIp(request.headers)), 600, 5))) {
      return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
    }
    const { email } = await parseBody(request, schema);
    // Same response whether or not the account exists (no account enumeration).
    await (
      await supabaseServer()
    ).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${env.appUrl}/auth/callback` },
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
