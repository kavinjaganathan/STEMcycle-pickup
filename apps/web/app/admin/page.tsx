import type { Metadata } from "next";
import { PickupsAdmin } from "@/components/admin/PickupsAdmin";

export const metadata: Metadata = { title: "Pickups" };

export default function AdminPickupsPage() {
  return <PickupsAdmin />;
}
