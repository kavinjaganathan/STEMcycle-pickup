import type { Metadata } from "next";
import { InactiveNotice } from "@/components/InactiveNotice";
import { PageHeader } from "@/components/ui";
import { requireDriver } from "@/lib/auth/guards";
import { createDriverApi } from "@/lib/db/driver";
import { AvailabilityEditor } from "./AvailabilityEditor";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const { driver, rpc } = await requireDriver();
  if (driver.status !== "active") return <InactiveNotice status={driver.status} />;
  const availability = await createDriverApi(rpc).availability();
  return (
    <>
      <PageHeader eyebrow="Weekend hours" title="When can you drive?" />
      <p className="mb-8 max-w-[60ch] leading-relaxed text-muted">
        Residents book from these set pickup times. Tap the ones you can drive on each weekend,
        especially any that say &ldquo;needs a driver&rdquo;. Your route is built from the times you
        pick. Each weekend locks on the Friday before, when routes become final.
      </p>
      <AvailabilityEditor initial={availability} />
    </>
  );
}
