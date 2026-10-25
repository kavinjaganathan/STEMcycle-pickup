import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { startDevSession } from "@/lib/auth";
import { startAdminSession } from "@/lib/auth/admin";
import { env } from "@/lib/env";

// Local development only: sign in as a seeded driver, or as the admin, without a password.
export async function POST(request: Request) {
  if (env.dataBackend !== "local" || env.isHosted) return json({ error: "Not found." }, 404);
  try {
    const body = await parseBody(
      request,
      z.union([z.object({ userId: z.uuid() }), z.object({ admin: z.literal(true) })]),
    );
    if ("admin" in body) await startAdminSession();
    else await startDevSession(body.userId);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
