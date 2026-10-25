import type { Metadata } from "next";
import { RoutesAdmin } from "@/components/admin/RoutesAdmin";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Routes", robots: { index: false } };

export default async function RoutesPage() {
  await requireAdmin();
  return <RoutesAdmin />;
}
