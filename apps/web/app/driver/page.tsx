import type { Metadata } from "next";
import { InactiveNotice } from "@/components/InactiveNotice";
import { PageHeader } from "@/components/ui";
import { requireDriver } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "My route" };

export default async function DriverHome() {
  const { driver } = await requireDriver();
  if (driver.status !== "active") return <InactiveNotice status={driver.status} />;
  return (
    <>
      <PageHeader eyebrow={`Hi, ${driver.full_name}`} title="My route" />
      <p className="text-muted">Your weekend routes will appear here.</p>
    </>
  );
}
