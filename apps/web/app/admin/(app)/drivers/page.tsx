import type { Metadata } from "next";
import { DriversAdmin } from "@/components/admin/DriversAdmin";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Drivers", robots: { index: false } };

export default async function DriversPage() {
  await requireAdmin();
  return <DriversAdmin />;
}
