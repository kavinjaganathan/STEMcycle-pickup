import { formatSlot, formatSlotDate, TEXTBOOK_LABEL } from "@/lib/format";
import type { Slot, TextbookType } from "@/lib/shared";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const e = escapeHtml;

/** Shared email shell in the site's style: white, ink text, purple accents. */
function layout(p: {
  orgName: string;
  eyebrow: string;
  title: string;
  body: string;
  button?: { href: string; label: string };
}) {
  const button = p.button
    ? `<a href="${e(p.button.href)}" style="display:inline-block;padding:14px 24px;border-radius:2px;background:#111111;color:#ffffff;text-decoration:none;font-weight:700">${e(p.button.label)}</a>`
    : "";
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f7f0fa;font-family:Montserrat,'Helvetica Neue',Arial,sans-serif;color:#111111">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e1ee;padding:32px">
  <p style="margin:0 0 8px;color:#8f3ba5;font-weight:600;font-size:14px">${e(p.eyebrow)}</p>
  <h1 style="font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;margin:0 0 20px">${e(p.title)}</h1>
  ${p.body}
  ${button}
  <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e4e1ee;color:#5f5f6b;font-size:13px">${e(p.orgName)}</p>
</div>
</body></html>`;
}

function rows(items: [string, string][]) {
  return `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px">${items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;font-weight:700;vertical-align:top">${e(k)}</td><td style="padding:4px 0">${e(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const para = (s: string) => `<p style="margin:0 0 20px;line-height:1.6">${e(s)}</p>`;

export function confirmationEmail(p: {
  orgName: string;
  name: string;
  bookCount: number;
  textbookType: TextbookType;
  addressLine: string;
  slot: Slot;
  cancelUrl: string;
}) {
  const when = formatSlot(p.slot);
  const subject = `Your ${p.orgName} book pickup: ${formatSlotDate(p.slot.slot_date)}`;
  const details: [string, string][] = [
    ["When", when],
    ["Where", p.addressLine],
    ["Books", `about ${p.bookCount} (${TEXTBOOK_LABEL[p.textbookType]})`],
  ];
  const leave =
    "Please leave the books in boxes or bags by your front door before your pickup hour starts.";

  const text = [
    `Hi ${p.name},`,
    "",
    "Thanks for donating textbooks! Your pickup is booked.",
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    leave,
    "",
    `Need to cancel? ${p.cancelUrl}`,
    "",
    `— ${p.orgName}`,
  ].join("\n");

  const html = layout({
    orgName: p.orgName,
    eyebrow: "Pickup booked",
    title: "Thanks for donating your textbooks",
    body:
      para(`Hi ${p.name}, your doorstep pickup is booked.`) +
      rows(details) +
      para(leave) +
      `<p style="margin:0 0 12px;color:#5f5f6b">Plans changed?</p>`,
    button: { href: p.cancelUrl, label: "Cancel this pickup" },
  });
  return { subject, text, html };
}

export function driverWelcomeEmail(p: { orgName: string; name: string }) {
  const subject = `Thanks for signing up to drive for ${p.orgName}`;
  const line =
    "Thanks for signing up to drive. Someone from the team will look over your details and email you once you're approved. After that, you can add the weekend hours you're free.";
  const text = [`Hi ${p.name},`, "", line, "", `— ${p.orgName}`].join("\n");
  const html = layout({
    orgName: p.orgName,
    eyebrow: "Driver sign-up",
    title: "Thanks for signing up",
    body: para(`Hi ${p.name}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`),
  });
  return { subject, text, html };
}

export function driverApprovedEmail(p: { orgName: string; name: string; appUrl: string }) {
  const url = `${p.appUrl}/driver/availability`;
  const subject = `You're approved to drive for ${p.orgName}`;
  const text = [
    `Hi ${p.name},`,
    "",
    "You're approved to drive. Add the weekend hours you're free here:",
    url,
    "",
    `— ${p.orgName}`,
  ].join("\n");
  const html = layout({
    orgName: p.orgName,
    eyebrow: "Account approved",
    title: "You're ready to drive",
    body: para(
      `Hi ${p.name}, you're approved to drive. Add the weekend hours you're free, and the app will plan your routes.`,
    ),
    button: { href: url, label: "Set my availability" },
  });
  return { subject, text, html };
}

export function routeEmail(p: {
  orgName: string;
  name: string;
  weekendDate: string;
  appUrl: string;
  kind: "ready" | "changed";
}) {
  const url = `${p.appUrl}/driver?weekend=${p.weekendDate}`;
  const weekend = `the weekend of ${formatSlotDate(p.weekendDate)}`;
  const subject =
    p.kind === "ready"
      ? `Your ${p.orgName} route for ${weekend}`
      : `Your ${p.orgName} route changed (${weekend})`;
  const line =
    p.kind === "ready"
      ? `Your route for ${weekend} is set. Open it on your phone to see your stops, times and directions.`
      : `Your route for ${weekend} was changed. Please look over your stops and times again.`;
  const text = [`Hi ${p.name},`, "", line, url, "", `— ${p.orgName}`].join("\n");
  const html = layout({
    orgName: p.orgName,
    eyebrow: p.kind === "ready" ? "Route ready" : "Route updated",
    title: p.kind === "ready" ? "Your route is ready" : "Your route changed",
    body: para(`Hi ${p.name}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`),
    button: { href: url, label: "Open my route" },
  });
  return { subject, text, html };
}

export function passwordResetEmail(p: { orgName: string; resetUrl: string }) {
  const subject = `Reset your ${p.orgName} password`;
  const line =
    "Someone asked to reset the password for your driver account. If that was you, open this link within an hour to choose a new one. If it wasn't, you can ignore this email.";
  const text = [line, "", p.resetUrl, "", `— ${p.orgName}`].join("\n");
  const html = layout({
    orgName: p.orgName,
    eyebrow: "Password reset",
    title: "Choose a new password",
    body: para(line),
    button: { href: p.resetUrl, label: "Reset password" },
  });
  return { subject, text, html };
}

/** A Contact Us message, delivered to the organization's inbox (reply goes to the sender). */
export function contactMessageEmail(p: {
  orgName: string;
  name: string;
  email: string;
  message: string;
}) {
  const subject = `Website message from ${p.name}`;
  const text = [
    `From: ${p.name} <${p.email}>`,
    "",
    p.message,
    "",
    `Sent with the Contact Us form. Reply to this email to answer ${p.name}.`,
  ].join("\n");
  const html = layout({
    orgName: p.orgName,
    eyebrow: "Contact Us form",
    title: `Message from ${p.name}`,
    body:
      rows([
        ["From", p.name],
        ["Email", p.email],
      ]) +
      `<p style="margin:0 0 20px;line-height:1.6;white-space:pre-wrap">${e(p.message)}</p>` +
      para("Reply to this email to answer them."),
  });
  return { subject, text, html };
}
