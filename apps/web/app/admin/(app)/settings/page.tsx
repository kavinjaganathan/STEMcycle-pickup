import type { Metadata } from "next";
import { SettingsAdmin } from "@/components/admin/SettingsAdmin";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  await requireAdmin();
  return <SettingsAdmin />;
}
