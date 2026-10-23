import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { updateUserSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const b = await parseBody(request, updateUserSchema);
  await createAdminApi(rpc).updateUser(z.uuid().parse(id), b);
  return json({ ok: true });
});
