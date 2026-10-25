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
        Tap the hours you&apos;re free on each upcoming weekend. Residents can only book times
        when a driver is available, and your route is built from these hours. Each weekend locks
        on the Friday before, when routes become final.
      </p>
      <AvailabilityEditor initial={availability} />
    </>
  );
}
