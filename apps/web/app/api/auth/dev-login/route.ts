import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { DEV_COOKIE, makeDevSession } from "@/lib/auth";
import { env } from "@/lib/env";

// Local development only: sign in as a seeded user without a password.
export async function POST(request: Request) {
  if (env.dataBackend !== "local" || env.isHosted) return json({ error: "Not found." }, 404);
  try {
    const { userId } = await parseBody(request, z.object({ userId: z.uuid() }));
    (await cookies()).set(DEV_COOKIE, makeDevSession(userId), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
