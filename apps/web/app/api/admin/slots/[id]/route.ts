import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { updateSlotSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const b = await parseBody(request, updateSlotSchema);
  await createAdminApi(rpc).updateSlot(z.uuid().parse(id), b.capacity, b.active);
  return json({ ok: true });
});

export const DELETE = withAuth<{ id: string }>("admin", async ({ rpc }, _request, { id }) => {
  await createAdminApi(rpc).deleteSlot(z.uuid().parse(id));
  return json({ ok: true });
});
