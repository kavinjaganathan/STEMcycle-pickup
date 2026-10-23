import type { Metadata } from "next";
import { RoutesAdmin } from "@/components/admin/RoutesAdmin";

export const metadata: Metadata = { title: "Route planner" };

export default function RoutesPage() {
  return <RoutesAdmin />;
}
