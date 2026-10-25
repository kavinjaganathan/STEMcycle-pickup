// Cloudflare build only (see next.config.ts): Workers send SMTP through
// lib/email/smtp-lite.ts instead of nodemailer.
const nodemailer = {
  createTransport(): never {
    throw new Error("nodemailer isn't available in the Cloudflare build");
  },
};
export default nodemailer;
