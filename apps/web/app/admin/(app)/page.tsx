import type { Metadata } from "next";
import { PickupsAdmin } from "@/components/admin/PickupsAdmin";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Pickups", robots: { index: false } };

export default async function AdminHome() {
  await requireAdmin();
  return <PickupsAdmin />;
}
