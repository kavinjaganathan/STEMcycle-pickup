import { errorResponse, json } from "@/lib/api";
import { createDriverAccount } from "@/lib/auth";
import { inviteOk } from "@/lib/auth/invite";
import { getDeps, readJson } from "@/lib/deps";
import { driverWelcomeEmail } from "@/lib/email/templates";
import { log } from "@/lib/logger";
import { clientIp, rateKey } from "@/lib/security";
import { driverSignupSchema, fieldErrors } from "@/lib/validation";

const DONE = {
  ok: true,
  message:
    "Thanks for signing up! An admin will review your account and email you when it's approved. You can sign in now to check your details.",
};

export async function POST(request: Request) {
  try {
    const deps = await getDeps();
    const ip = clientIp(request.headers);
    if (!(await deps.repo.rateLimitHit(rateKey("signup-ip", ip), 3600, 5))) {
      return json({ error: "Too many sign-ups from this network. Please try again later." }, 429);
    }
    const parsed = driverSignupSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return json(
        { error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) },
        400,
      );
    }
    const { website, turnstileToken, invite, ...input } = parsed.data;
    if (website) return json(DONE, 201); // honeypot
    if (!inviteOk(invite)) {
      return json(
        { error: "This sign-up link isn't valid. Ask the StemCycle team for a new one." },
        403,
      );
    }
    if (!(await deps.verifyTurnstile(turnstileToken, ip))) {
      return json({ error: "We couldn't verify you're human. Please try the check again." }, 403);
    }

    if (!(await createDriverAccount(input))) {
      // Same answer as a new sign-up: don't reveal which emails have accounts.
      log("info", "signup_existing_email");
      return json(DONE, 201);
    }
    log("info", "driver_signed_up");
    try {
      const settings = await deps.repo.getPublicSettings();
      await deps.sendEmail(
        {
          to: input.email,
          ...driverWelcomeEmail({ orgName: settings.org_name, name: input.full_name }),
        },
        { displayName: settings.email_display_name },
      );
    } catch (err) {
      log("warn", "welcome_email_failed", { err });
    }
    return json(DONE, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
