import { z } from "zod";
import { json, withAuth } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";
import { DATE_RE } from "@/lib/dates";

export const GET = withAuth("admin", async ({ rpc }, request) => {
  const date = z.string().regex(DATE_RE).parse(new URL(request.url).searchParams.get("date"));
  return json({ plan: await createAdminApi(rpc).getRoutePlan(date) });
});
