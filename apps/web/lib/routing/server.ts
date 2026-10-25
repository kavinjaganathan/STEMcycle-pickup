import "server-only";
import { getGeocodeRepo, getRepo, getServiceRpc } from "@/lib/db";
import { createRoutingApi } from "@/lib/db/routing";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { geocodePending } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { routeLine } from "./geometry";
import { buildMatrix } from "./matrix";
import type { SchedulerDeps } from "./scheduler";
import { solveRemote } from "./solver-client";

export async function getSchedulerDeps(): Promise<SchedulerDeps> {
  const repo = await getRepo();
  return {
    routing: createRoutingApi(await getServiceRpc()),
    buildMatrix,
    solveRemote,
    routeLine,
    sendEmail,
    settings: () => repo.getPublicSettings(),
    appUrl: env.appUrl,
    now: () => new Date(),
    geocodePending: async () => geocodePending(await getGeocodeRepo(), await getGeocoder(), 20),
  };
}
