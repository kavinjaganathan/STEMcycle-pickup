import { json, parseBody, withAuth } from "@/lib/api";
import { createUserSchema } from "@/lib/admin-schemas";
import { createAuthUser } from "@/lib/auth";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAuth("admin", async ({ rpc }) =>
  json({ users: await createAdminApi(rpc).listUsers() }),
);

export const POST = withAuth("admin", async ({ rpc }, request) => {
  const b = await parseBody(request, createUserSchema);
  const { id, tempPassword } = await createAuthUser(b.email);
  await createAdminApi(rpc).updateUser(id, {
    role: b.role,
    full_name: b.full_name,
    phone: b.phone,
    active: true,
  });
  // The temporary password is returned once, to the admin, and never stored by us.
  return json({ id, tempPassword }, 201);
});
