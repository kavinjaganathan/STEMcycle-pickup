import "server-only";
import { redirect } from "next/navigation";
import { getDriver, type DriverContext } from "./index";
import { getAdmin } from "./admin";

/** Page guard for the driver area: the signed-in driver, or a redirect to /login. */
export async function requireDriver(): Promise<DriverContext> {
  const ctx = await getDriver();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Page guard for the admin area. */
export async function requireAdmin() {
  const ctx = await getAdmin();
  if (!ctx) redirect("/admin/login");
  return ctx;
}
