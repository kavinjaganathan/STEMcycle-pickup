import { json } from "@/lib/api";
import { signOutDriver } from "@/lib/auth";

export async function POST() {
  await signOutDriver();
  return json({ ok: true });
}
