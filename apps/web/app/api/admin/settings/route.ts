import { json, parseBody, withAuth } from "@/lib/api";
import { settingsSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAuth("admin", async ({ rpc }) =>
  json({ settings: await createAdminApi(rpc).getSettings() }),
);

export const PUT = withAuth("admin", async ({ rpc }, request) => {
  const s = await parseBody(request, settingsSchema);
  await createAdminApi(rpc).updateSettings({ ...s, reply_to: s.reply_to || null });
  return json({ ok: true });
});
