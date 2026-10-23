import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { getGeocodeRepo } from "@/lib/db";
import { createAdminApi } from "@/lib/db/admin";
import { DATE_RE, TIME_RE } from "@/lib/dates";
import { geocodePending } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { routeLine } from "@/lib/routing/geometry";
import { buildMatrix, RoutingError } from "@/lib/routing/matrix";
import { PlanError, planRoutes } from "@/lib/routing/plan";
import { solveRemote } from "@/lib/routing/solver-client";

// The solver may need to wake up (Render free tier), so allow a long request.
export const maxDuration = 120;

const schema = z.object({
  date: z.string().regex(DATE_RE),
  start_depot_id: z.uuid(),
  end_depot_id: z.uuid(),
  start_time: z.string().regex(TIME_RE),
  vehicles: z
    .array(z.object({ vehicle_id: z.uuid(), driver_id: z.uuid().nullable() }))
    .min(1, "Choose at least one vehicle.")
    .max(20),
});

export const POST = withAuth("admin", async ({ rpc }, request) => {
  const body = await parseBody(request, schema);
  try {
    const result = await planRoutes(
      {
        admin: createAdminApi(rpc),
        buildMatrix,
        solveRemote,
        routeLine,
        geocodePending: async () => geocodePending(await getGeocodeRepo(), await getGeocoder(), 25),
      },
      body,
    );
    return json(result, 201);
  } catch (err) {
    if (err instanceof PlanError || err instanceof RoutingError)
      return json({ error: err.message }, 400);
    throw err;
  }
});
