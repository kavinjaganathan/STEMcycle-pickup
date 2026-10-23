import { z } from "zod";
import { json, withAuth } from "@/lib/api";
import { DATE_RE } from "@/lib/dates";
import { createDriverApi } from "@/lib/db/driver";

export const GET = withAuth("driver", async ({ rpc }, request) => {
  const date = z.string().regex(DATE_RE).parse(new URL(request.url).searchParams.get("date"));
  return json({ routes: await createDriverApi(rpc).routes(date) });
});
