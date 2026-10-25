import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { createRecoveryLink } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { clientIp, rateKey } from "@/lib/security";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

/** Emails a password-reset link. Same response whether or not the account exists. */
export async function POST(request: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.rateLimitHit(rateKey("reset-ip", clientIp(request.headers)), 3600, 5))) {
      return json({ error: "Too many attempts. Please wait a while." }, 429);
    }
    const { email } = await parseBody(request, schema);
    if (env.dataBackend !== "supabase")
      return json({ error: "Password resets need the hosted database." }, 400);
    if (!(await repo.rateLimitHit(rateKey("reset-email", email), 3600, 3))) {
      return json({ ok: true });
    }
    const link = await createRecoveryLink(email);
    if (link) {
      const settings = await repo.getPublicSettings();
      await sendEmail(
        { to: email, ...passwordResetEmail({ orgName: settings.org_name, resetUrl: link }) },
        { displayName: settings.email_display_name },
      );
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
