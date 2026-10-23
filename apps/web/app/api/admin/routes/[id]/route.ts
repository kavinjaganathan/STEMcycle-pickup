import { z } from "zod";
import { json, withAuth } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

// Discard a draft plan.
export const DELETE = withAuth<{ id: string }>("admin", async ({ rpc }, _request, { id }) => {
  await createAdminApi(rpc).discardRoutePlan(z.uuid().parse(id));
  return json({ ok: true });
});
