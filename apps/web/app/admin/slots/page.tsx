import type { Metadata } from "next";
import { SlotsAdmin } from "@/components/admin/SlotsAdmin";

export const metadata: Metadata = { title: "Pickup windows" };

export default function Page() {
  return <SlotsAdmin />;
}
