import { cookies } from "next/headers";
import { json } from "@/lib/api";
import { DEV_COOKIE, supabaseServer } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST() {
  if (env.dataBackend === "supabase") await (await supabaseServer()).auth.signOut();
  else (await cookies()).delete(DEV_COOKIE);
  return json({ ok: true });
}
