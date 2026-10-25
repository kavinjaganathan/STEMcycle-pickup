import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Sign up to drive" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow">Volunteer drivers</p>
      <h1 className="display mt-1 text-4xl">Sign up to drive</h1>
      <p className="mt-4 leading-relaxed text-muted">
        After you confirm your email, an admin approves your account. Then you can add the
        weekend hours you&apos;re free.
      </p>
      <div className="panel mt-8 p-5 sm:p-8">
        <SignupForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
      </div>
      <p className="mt-6 text-sm text-muted">
        Already signed up?{" "}
        <Link href="/login" className="font-bold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
