import "server-only";
import type { PublicSettings } from "@/lib/db/repo";

/**
 * Where Contact Us messages go and which address the page shows: CONTACT_EMAIL
 * if set, otherwise the reply-to address from Settings, otherwise EMAIL_FROM
 * (the account the app already sends from). Null if none is configured.
 */
export function contactEmail(settings: Pick<PublicSettings, "reply_to">): string | null {
  return (
    process.env.CONTACT_EMAIL?.trim() ||
    settings.reply_to?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    null
  );
}
