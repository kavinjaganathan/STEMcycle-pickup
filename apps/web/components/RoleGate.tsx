import { redirect } from "next/navigation";
import { getAuth, type Role, type SessionUser } from "@/lib/auth";

/** Server-side page guard. Must be rendered inside <Suspense> (reads cookies). */
export async function RoleGate({
  role,
  children,
}: {
  role: Role;
  children: (user: SessionUser) => React.ReactNode;
}) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.role !== role) redirect(auth.user.role === "admin" ? "/admin" : "/driver");
  return <>{children(auth.user)}</>;
}
