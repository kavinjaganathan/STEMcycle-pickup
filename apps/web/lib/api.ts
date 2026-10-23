import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { getAuth, type AuthContext, type Role } from "@/lib/auth";
import { RpcError } from "@/lib/db/repo";
import { log } from "@/lib/logger";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Friendly text for business-rule error codes raised by the SQL functions. */
const APP_ERRORS: Record<string, string> = {
  not_found: "That item no longer exists.",
  slot_has_pickups: "This window has pickups booked. Deactivate it instead of deleting.",
  invalid_window: "The end time must be after the start time.",
  cannot_demote_self: "You can't remove your own admin access.",
  email_exists: "Someone with that email already has an account.",
  plan_not_draft: "Only draft plans can be published.",
  stop_not_yours: "That stop isn't on your route.",
};

/**
 * Wraps an authenticated route handler: checks the session and role, then maps
 * thrown errors to JSON responses without leaking details.
 */
export function withAuth<P = unknown>(
  role: Role | "any",
  handler: (ctx: AuthContext, request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    // Outside the try: lets Next's prerender bail-out propagate instead of being logged.
    await connection();
    try {
      const auth = await getAuth();
      if (!auth) return json({ error: "Please sign in." }, 401);
      if (role !== "any" && auth.user.role !== role) return json({ error: "Not allowed." }, 403);
      return await handler(auth, request, await context.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof z.ZodError) {
    return json(
      { error: "Please check the highlighted fields.", issues: z.flattenError(err).fieldErrors },
      400,
    );
  }
  if (err instanceof RpcError) {
    if (err.forbidden) return json({ error: "Not allowed." }, 403);
    if (err.code === "P0001") return json({ error: APP_ERRORS[err.message] ?? err.message }, 400);
  }
  if (err instanceof Error && APP_ERRORS[err.message]) {
    return json({ error: APP_ERRORS[err.message] }, 400);
  }
  log("error", "api_error", { err });
  return json({ error: "Something went wrong on our end. Please try again." }, 500);
}

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  const text = await request.text();
  if (text.length > 65_536)
    throw new z.ZodError([{ code: "custom", path: [], message: "too large", input: "" }]);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  return schema.parse(raw);
}
