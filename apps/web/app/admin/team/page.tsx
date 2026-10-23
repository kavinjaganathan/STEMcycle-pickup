import type { Metadata } from "next";
import { TeamAdmin } from "@/components/admin/TeamAdmin";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return <TeamAdmin />;
}
