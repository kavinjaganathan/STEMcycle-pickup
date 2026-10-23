import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { supabaseServer } from "@/lib/auth";
import { env } from "@/lib/env";

const schema = z.object({ password: z.string().min(10, "Use at least 10 characters.").max(200) });

export const POST = withAuth("any", async (_ctx, request) => {
  if (env.dataBackend !== "supabase")
    return json({ error: "Passwords aren't used in local development." }, 400);
  const { password } = await parseBody(request, schema);
  const { error } = await (await supabaseServer()).auth.updateUser({ password });
  if (error) return json({ error: "Couldn't change the password. Try a stronger one." }, 400);
  return json({ ok: true });
});
