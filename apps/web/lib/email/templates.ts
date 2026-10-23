import type { SlotWindow } from "@/lib/db/repo";
import { formatSlotDate, formatWindow } from "@/lib/format";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function confirmationEmail(p: {
  orgName: string;
  name: string;
  bookCount: number;
  addressLine: string;
  slot: SlotWindow;
  cancelUrl: string;
}) {
  const date = formatSlotDate(p.slot.slot_date);
  const window = formatWindow(p.slot);
  const subject = `Your ${p.orgName} book pickup: ${date}`;

  const text = [
    `Hi ${p.name},`,
    "",
    `Thanks for donating textbooks! We've received your pickup request.`,
    "",
    `When: ${date}, ${window}`,
    `Where: ${p.addressLine}`,
    `Books: about ${p.bookCount}`,
    "",
    "Please leave the books in boxes or bags by your front door before the window starts.",
    "",
    `Need to cancel? ${p.cancelUrl}`,
    "",
    `— ${p.orgName}`,
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1c2b24">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Your book pickup is booked</h1>
  <p style="margin:0 0 16px">Hi ${e(p.name)}, thanks for donating textbooks! We've received your pickup request.</p>
  <table role="presentation" style="border-collapse:collapse;margin:0 0 16px">
    <tr><td style="padding:4px 12px 4px 0;font-weight:bold">When</td><td>${e(date)}, ${e(window)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Where</td><td>${e(p.addressLine)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Books</td><td>about ${p.bookCount}</td></tr>
  </table>
  <p style="margin:0 0 24px">Please leave the books in boxes or bags by your front door before the window starts.</p>
  <p style="margin:0 0 8px">Plans changed?</p>
  <a href="${e(p.cancelUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1f6f4a;color:#ffffff;text-decoration:none">Cancel this pickup</a>
  <p style="margin:24px 0 0;color:#5b6b63;font-size:13px">— ${e(p.orgName)}</p>
</div>
</body></html>`;

  return { subject, text, html };
}
