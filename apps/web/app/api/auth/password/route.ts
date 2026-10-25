import { json, parseBody, withDriver } from "@/lib/api";
import { changeDriverPassword } from "@/lib/auth";
import { newPasswordSchema } from "@/lib/validation";

export const POST = withDriver(
  async ({ driver }, request) => {
    const { password } = await parseBody(request, newPasswordSchema);
    if (!(await changeDriverPassword(driver.id, password)))
      return json({ error: "Couldn't change the password. Try a stronger one." }, 400);
    return json({ ok: true });
  },
  { allowInactive: true },
);
