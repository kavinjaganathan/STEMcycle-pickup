import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { Spinner } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Pickups" },
  { href: "/admin/routes", label: "Routes" },
  { href: "/admin/slots", label: "Windows" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/depots", label: "Depots" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<Spinner />}>
      <RoleGate role="admin">
        {(user) => (
          <AppShell nav={NAV} userName={user.full_name || user.email}>
            {children}
          </AppShell>
        )}
      </RoleGate>
    </Suspense>
  );
}
