import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { getDriver, type DriverContext } from "@/lib/auth";
import { getAdmin } from "@/lib/auth/admin";
import type { Rpc } from "@/lib/db/repo";
import { RpcError } from "@/lib/db/repo";
import { TemporaryGeocodeError } from "@/lib/geocode";
import { log } from "@/lib/logger";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Friendly text for business-rule error codes raised by the SQL functions. */
const APP_ERRORS: Record<string, string> = {
  not_found: "That item no longer exists.",
  invalid_location: "That location isn't valid.",
  availability_locked: "That weekend is locked: routes are final. Ask the admin to make changes.",
  hours_out_of_range: "Those aren't pickup times. Reload the page to see the current ones.",
  driver_not_active: "That driver isn't active.",
  pickup_cancelled: "The resident cancelled this pickup.",
  stop_not_yours: "That stop isn't on your route.",
};

type Handler<C, P> = (ctx: C, request: Request, params: P) => Promise<Response>;
type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a driver route handler: requires a signed-in driver (active unless
 * `allowInactive`), then maps thrown errors to JSON without leaking details.
 */
export function withDriver<P = unknown>(
  handler: Handler<DriverContext, P>,
  opts: { allowInactive?: boolean } = {},
) {
  return async (request: Request, context: RouteContext<P>) => {
    // Outside the try: lets Next's prerender bail-out propagate instead of being logged.
    await connection();
    try {
      const ctx = await getDriver();
      if (!ctx) return json({ error: "Please sign in." }, 401);
      if (!opts.allowInactive && ctx.driver.status !== "active")
        return json({ error: "Your account isn't active yet." }, 403);
      return await handler(ctx, request, await context.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wraps an admin route handler: requires the admin session cookie. */
export function withAdmin<P = unknown>(handler: Handler<{ rpc: Rpc }, P>) {
  return async (request: Request, context: RouteContext<P>) => {
    await connection();
    try {
      const ctx = await getAdmin();
      if (!ctx) return json({ error: "Please sign in." }, 401);
      return await handler(ctx, request, await context.params);
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
  if (err instanceof TemporaryGeocodeError) {
    return json(
      { error: "The address lookup service is busy. Please try again in a minute." },
      503,
    );
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
