import { settingsSchema } from "@/lib/admin-schemas";
import { json, parseBody, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAdmin(async ({ rpc }) => json(await createAdminApi(rpc).getSettings()));

export const PUT = withAdmin(async ({ rpc }, request) => {
  const s = await parseBody(request, settingsSchema);
  await createAdminApi(rpc).updateSettings({ ...s, reply_to: s.reply_to || null });
  return json({ ok: true });
});
