import "server-only";
import type { Repo, Slot } from "@/lib/db/repo";
import type { SendEmail } from "@/lib/email";
import { confirmationEmail } from "@/lib/email/templates";
import { log } from "@/lib/logger";
import { hashToken, newCancelToken, rateKey } from "@/lib/security";
import {
  cancelRequestSchema,
  fieldErrors,
  OUT_OF_AREA_MESSAGE,
  pickupFormSchema,
  type FieldErrors,
} from "@/lib/validation";

export const LIMITS = {
  submitPerIp: { windowSeconds: 600, max: 5 },
  submitPerEmail: { windowSeconds: 86_400, max: 3 },
  cancelPerIp: { windowSeconds: 600, max: 30 },
};

export type Deps = {
  repo: Repo;
  sendEmail: SendEmail;
  verifyTurnstile: (token: string | undefined, ip: string) => Promise<boolean>;
  appUrl: string;
  now: () => Date;
};

type Outcome<T> = { status: number; body: T; pickupId?: string };

export type SubmitBody =
  | { ok: true; slot: Slot | null; emailSent: boolean; cancelUrl?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export async function submitPickup(
  deps: Deps,
  raw: unknown,
  ip: string,
): Promise<Outcome<SubmitBody>> {
  const { repo } = deps;
  const ipOk = await repo.rateLimitHit(
    rateKey("submit-ip", ip),
    LIMITS.submitPerIp.windowSeconds,
    LIMITS.submitPerIp.max,
  );
  if (!ipOk) return fail(429, "Too many requests. Please wait a few minutes and try again.");

  const parsed = pickupFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "Please fix the highlighted fields.",
        fieldErrors: fieldErrors(parsed.error),
      },
    };
  }
  const data = parsed.data;

  // Honeypot tripped: pretend it worked so bots learn nothing.
  if (data.website) {
    log("info", "honeypot_tripped");
    return { status: 201, body: { ok: true, slot: null, emailSent: true } };
  }

  if (!(await deps.verifyTurnstile(data.turnstileToken, ip))) {
    return fail(403, "We couldn't verify you're human. Please try the check again.");
  }

  const emailOk = await repo.rateLimitHit(
    rateKey("submit-email", data.email),
    LIMITS.submitPerEmail.windowSeconds,
    LIMITS.submitPerEmail.max,
  );
  if (!emailOk)
    return fail(
      429,
      "This email has made several requests today. Please contact us if you need help.",
    );

  const { token, hash } = newCancelToken();
  const result = await repo.createPickup(
    {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address_line: data.address_line,
      city: data.city,
      zip: data.zip,
      textbook_type: data.textbook_type,
      book_count: data.book_count,
      notes: data.notes,
      ...data.slot,
    },
    hash,
    deps.now(),
  );

  switch (result.result) {
    case "out_of_area":
      return {
        status: 422,
        body: { ok: false, error: OUT_OF_AREA_MESSAGE, fieldErrors: { zip: OUT_OF_AREA_MESSAGE } },
      };
    case "slot_full":
    case "slot_unavailable":
      return {
        status: 409,
        body: {
          ok: false,
          error: "That pickup time just filled up. Please choose another.",
          fieldErrors: { slot: "That time is no longer available. Please choose another." },
        },
      };
  }

  log("info", "pickup_created", { pickup_id: result.pickup_id });

  const cancelUrl = `${deps.appUrl}/cancel/${token}`;
  let emailSent = true;
  try {
    const settings = await repo.getPublicSettings();
    const msg = confirmationEmail({
      orgName: settings.org_name,
      name: data.name,
      bookCount: data.book_count,
      textbookType: data.textbook_type,
      addressLine: `${data.address_line}, ${data.city} ${data.zip}`,
      slot: result.slot,
      cancelUrl,
    });
    await deps.sendEmail(
      { to: data.email, replyTo: settings.reply_to, ...msg },
      {
        displayName: settings.email_display_name,
      },
    );
  } catch (err) {
    emailSent = false;
    log("error", "confirmation_email_failed", { pickup_id: result.pickup_id, err });
  }

  return {
    status: 201,
    pickupId: result.pickup_id,
    // Only fall back to showing the cancel link on screen if the email failed.
    body: { ok: true, slot: result.slot, emailSent, ...(emailSent ? {} : { cancelUrl }) },
  };
}

export type CancelBody =
  | { ok: true; state: "pending" | "scheduled" | "picked_up" | "cancelled"; slot: Slot }
  | { ok: true; state: "cancelled_now" }
  | { ok: false; error: string };

export async function handleCancel(
  deps: Pick<Deps, "repo">,
  raw: unknown,
  ip: string,
): Promise<Outcome<CancelBody>> {
  const ok = await deps.repo.rateLimitHit(
    rateKey("cancel-ip", ip),
    LIMITS.cancelPerIp.windowSeconds,
    LIMITS.cancelPerIp.max,
  );
  if (!ok) return fail(429, "Too many requests. Please wait a few minutes and try again.");

  const parsed = cancelRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(404, "This cancel link isn't valid.");
  const hash = hashToken(parsed.data.token);

  if (parsed.data.action === "lookup") {
    const found = await deps.repo.lookupCancel(hash);
    if (!found) return fail(404, "This cancel link isn't valid or has expired.");
    const { status, ...slot } = found;
    return { status: 200, body: { ok: true, state: status, slot } };
  }

  const res = await deps.repo.cancelPickup(hash);
  switch (res.result) {
    case "cancelled":
      return { status: 200, body: { ok: true, state: "cancelled_now" } };
    case "already_cancelled":
      return fail(409, "This pickup was already cancelled.");
    case "already_picked_up":
      return fail(409, "These books have already been picked up — thank you!");
    default:
      return fail(404, "This cancel link isn't valid or has expired.");
  }
}

function fail(status: number, error: string): Outcome<{ ok: false; error: string }> {
  return { status, body: { ok: false, error } };
}
