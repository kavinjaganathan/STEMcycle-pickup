import { AppShell } from "@/components/AppShell";

const TABS = [
  { href: "/admin", label: "Pickups", exact: true },
  { href: "/admin/routes", label: "Routes" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell tabs={TABS} signOut={{ endpoint: "/api/admin/logout", to: "/admin/login" }}>
      {children}
    </AppShell>
  );
}
