import { z } from "zod";
import { updateDriverSchema } from "@/lib/admin-schemas";
import { json, parseBody, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";
import { getRepo } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { driverApprovedEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export const PATCH = withAdmin<{ id: string }>(async ({ rpc }, request, { id }) => {
  const body = await parseBody(request, updateDriverSchema);
  const driverId = z.uuid().parse(id);
  const prev = await createAdminApi(rpc).updateDriver(driverId, body.status, body.capacity_boxes);

  let emailed = false;
  if (body.status === "active" && prev.previous_status === "pending") {
    try {
      const settings = await (await getRepo()).getPublicSettings();
      await sendEmail(
        {
          to: prev.email,
          ...driverApprovedEmail({
            orgName: settings.org_name,
            name: prev.full_name,
            appUrl: env.appUrl,
          }),
        },
        { displayName: settings.email_display_name },
      );
      emailed = true;
    } catch (err) {
      log("error", "approval_email_failed", { driver_id: driverId, err });
    }
  }
  return json({ ok: true, emailed });
});
