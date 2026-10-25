import { errorResponse, json } from "@/lib/api";
import { createDriverAccount } from "@/lib/auth";
import { getDeps, readJson } from "@/lib/deps";
import { driverConfirmEmail } from "@/lib/email/templates";
import { log } from "@/lib/logger";
import { clientIp, rateKey } from "@/lib/security";
import { driverSignupSchema, fieldErrors } from "@/lib/validation";

const DONE = {
  ok: true,
  message:
    "Thanks for signing up! Check your email to confirm your address. An admin will approve your account soon.",
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
    const { website, turnstileToken, ...input } = parsed.data;
    if (website) return json(DONE, 201); // honeypot
    if (!(await deps.verifyTurnstile(turnstileToken, ip))) {
      return json({ error: "We couldn't verify you're human. Please try the check again." }, 403);
    }

    const account = await createDriverAccount(input);
    if (!account) {
      // Same answer as a new sign-up: don't reveal which emails have accounts.
      log("info", "signup_existing_email");
      return json(DONE, 201);
    }
    log("info", "driver_signed_up");
    if (account.confirmUrl) {
      const settings = await deps.repo.getPublicSettings();
      await deps.sendEmail(
        {
          to: input.email,
          ...driverConfirmEmail({
            orgName: settings.org_name,
            name: input.full_name,
            confirmUrl: account.confirmUrl,
          }),
        },
        { displayName: settings.email_display_name },
      );
    }
    return json(DONE, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
