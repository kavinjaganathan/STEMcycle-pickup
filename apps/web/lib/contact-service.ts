import "server-only";
import { contactEmail } from "@/lib/contact";
import { contactMessageEmail } from "@/lib/email/templates";
import { log } from "@/lib/logger";
import type { Deps } from "@/lib/pickups/service";
import { rateKey } from "@/lib/security";
import { contactSchema, fieldErrors, type FieldErrors } from "@/lib/validation";

export type ContactBody = { ok: true } | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Contact Us: emails the message to the organization. Never claims success unless it was sent. */
export async function submitContact(
  deps: Pick<Deps, "repo" | "sendEmail" | "verifyTurnstile">,
  raw: unknown,
  ip: string,
): Promise<{ status: number; body: ContactBody }> {
  const fail = (status: number, error: string, fe?: FieldErrors) => ({
    status,
    body: { ok: false as const, error, ...(fe ? { fieldErrors: fe } : {}) },
  });
  if (!(await deps.repo.rateLimitHit(rateKey("contact-ip", ip), 3600, 5)))
    return fail(429, "Too many messages from this network. Please try again later.");

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success)
    return fail(400, "Please fix the highlighted fields.", fieldErrors(parsed.error));
  const { website, turnstileToken, ...msg } = parsed.data;
  if (website) return { status: 200, body: { ok: true } }; // honeypot: bots learn nothing
  if (!(await deps.verifyTurnstile(turnstileToken, ip)))
    return fail(403, "We couldn't verify you're human. Please try the check again.");
  if (!(await deps.repo.rateLimitHit(rateKey("contact-email", msg.email), 86_400, 3)))
    return fail(429, "You've sent several messages today. We'll reply soon.");

  const settings = await deps.repo.getPublicSettings();
  const to = contactEmail(settings);
  if (!to) return fail(503, "Messages can't be sent right now.");
  try {
    await deps.sendEmail(
      { to, replyTo: msg.email, ...contactMessageEmail({ orgName: settings.org_name, ...msg }) },
      { displayName: settings.email_display_name },
    );
  } catch (err) {
    log("error", "contact_email_failed", { err });
    return fail(502, `We couldn't send your message. Please email us directly at ${to}.`);
  }
  log("info", "contact_message_sent");
  return { status: 200, body: { ok: true } };
}
