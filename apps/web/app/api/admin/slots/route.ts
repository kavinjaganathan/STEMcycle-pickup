import { json, parseBody, withAuth } from "@/lib/api";
import { createSlotsSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";
import { datesBetween, todayIn } from "@/lib/dates";

export const GET = withAuth("admin", async ({ rpc }) => {
  const api = createAdminApi(rpc);
  const { timezone } = await api.getSettings();
  return json({ slots: await api.listSlots(todayIn(timezone)) });
});

export const POST = withAuth("admin", async ({ rpc }, request) => {
  const b = await parseBody(request, createSlotsSchema);
  const dates = datesBetween(b.from, b.to, b.weekdays);
  if (dates.length === 0) return json({ error: "No dates match those weekdays." }, 400);
  if (dates.length > 200) return json({ error: "That's too many windows at once (max 200)." }, 400);
  const res = await createAdminApi(rpc).createSlots(dates, b.start_time, b.end_time, b.capacity);
  return json(res, 201);
});
