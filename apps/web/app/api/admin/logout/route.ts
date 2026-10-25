import { json } from "@/lib/api";
import { endAdminSession } from "@/lib/auth/admin";

export async function POST() {
  await endAdminSession();
  return json({ ok: true });
}
