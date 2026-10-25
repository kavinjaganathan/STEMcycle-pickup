import { json, parseBody, withDriver } from "@/lib/api";
import { driverProfileSchema } from "@/lib/validation";

export const PATCH = withDriver(
  async ({ rpc }, request) => {
    const p = await parseBody(request, driverProfileSchema);
    await rpc("driver_update_profile", {
      p_full_name: p.full_name,
      p_phone: p.phone,
      p_capacity: p.capacity_boxes,
    });
    return json({ ok: true });
  },
  { allowInactive: true },
);
