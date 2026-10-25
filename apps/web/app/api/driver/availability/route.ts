import { z } from "zod";
import { json, parseBody, withDriver } from "@/lib/api";
import { createDriverApi } from "@/lib/db/driver";
import { DATE_RE } from "@/lib/dates";

const schema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().regex(DATE_RE),
        hours: z.array(z.number().int().min(0).max(23)).max(24),
      }),
    )
    .min(1)
    .max(30),
});

export const GET = withDriver(async ({ rpc }) => json(await createDriverApi(rpc).availability()));

/** Replaces the driver's hours for each listed day. */
export const PUT = withDriver(async ({ rpc }, request) => {
  const { days } = await parseBody(request, schema);
  const api = createDriverApi(rpc);
  for (const d of days) await api.setAvailability(d.date, d.hours);
  return json(await api.availability());
});
