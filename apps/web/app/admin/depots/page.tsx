import type { Metadata } from "next";
import { DepotsAdmin } from "@/components/admin/DepotsAdmin";

export const metadata: Metadata = { title: "Depots" };

export default function Page() {
  return <DepotsAdmin />;
}
