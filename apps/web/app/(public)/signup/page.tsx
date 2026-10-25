import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inviteCode, inviteOk } from "@/lib/auth/invite";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Driver sign-up",
  robots: { index: false, follow: false },
};

export default function SignupPage(props: PageProps<"/signup">) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow">Volunteer drivers</p>
      <h1 className="display mt-1 text-4xl">Driver sign-up</h1>
      <Suspense fallback={null}>
        <SignupGate searchParams={props.searchParams} />
      </Suspense>
      <p className="mt-6 text-sm text-muted">
        Already signed up?{" "}
        <Link href="/login" className="font-bold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

async function SignupGate({
  searchParams,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
}) {
  const raw = (await searchParams).invite;
  const invite = typeof raw === "string" ? raw : undefined;
  if (inviteCode() && !inviteOk(invite)) {
    return (
      <p className="mt-6 border-l-4 border-brand bg-tint p-4 leading-relaxed">
        Driver sign-up is by invitation. If you&apos;d like to volunteer, ask the StemCycle team for
        a sign-up link.
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 leading-relaxed text-muted">
        An admin reviews every sign-up. Once you&apos;re approved, you can add the weekend hours
        you&apos;re free.
      </p>
      <div className="panel mt-8 p-5 sm:p-8">
        <SignupForm
          invite={invite ?? ""}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        />
      </div>
    </>
  );
}
