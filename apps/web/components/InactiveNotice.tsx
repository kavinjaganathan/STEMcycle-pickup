import Link from "next/link";
import type { DriverStatus } from "@/lib/auth";

/** Shown in place of driver tools until the admin approves the account. */
export function InactiveNotice({ status }: { status: DriverStatus }) {
  return (
    <div className="panel max-w-xl p-6 sm:p-8">
      <p className="eyebrow">{status === "pending" ? "Almost there" : "Account paused"}</p>
      <h1 className="display mt-1 text-3xl">
        {status === "pending" ? "Waiting for approval" : "Your account is turned off"}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        {status === "pending"
          ? "Thanks for signing up! An admin will review your account soon, and we'll email you when you can add your weekend hours."
          : "An admin has turned off your driver account. Contact StemCycle if you think this is a mistake."}
      </p>
      <p className="mt-6">
        <Link href="/driver/account" className="font-bold underline underline-offset-4">
          Check your account details
        </Link>
      </p>
    </div>
  );
}
