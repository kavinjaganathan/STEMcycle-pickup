import { z } from "zod";
import { json, withAuth } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

export const POST = withAuth<{ id: string }>("admin", async ({ rpc }, _request, { id }) => {
  await createAdminApi(rpc).publishRoutePlan(z.uuid().parse(id));
  return json({ ok: true });
});
