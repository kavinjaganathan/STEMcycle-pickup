import { z } from "zod";
import { json, parseBody, withDriver } from "@/lib/api";
import { createDriverApi } from "@/lib/db/driver";

export const POST = withDriver<{ id: string }>(async ({ rpc }, request, { id }) => {
  const { picked_up } = await parseBody(request, z.object({ picked_up: z.boolean() }));
  return json(await createDriverApi(rpc).setStopStatus(z.uuid().parse(id), picked_up));
});
