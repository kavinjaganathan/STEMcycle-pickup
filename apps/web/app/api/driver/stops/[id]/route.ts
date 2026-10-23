import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { createDriverApi } from "@/lib/db/driver";

export const POST = withAuth<{ id: string }>("driver", async ({ rpc }, request, { id }) => {
  const { picked_up } = await parseBody(request, z.object({ picked_up: z.boolean() }));
  return json(await createDriverApi(rpc).setStopStatus(z.uuid().parse(id), picked_up));
});
