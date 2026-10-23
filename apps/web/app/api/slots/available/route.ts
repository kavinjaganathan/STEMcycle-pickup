import { connection } from "next/server";
import { getRepo } from "@/lib/db";

export async function GET() {
  await connection();
  const repo = await getRepo();
  const slots = await repo.listAvailableSlots(new Date());
  return Response.json({ slots }, { headers: { "Cache-Control": "no-store" } });
}
