import { AppShell } from "@/components/AppShell";

const TABS = [
  { href: "/driver", label: "My route", exact: true },
  { href: "/driver/availability", label: "Availability" },
  { href: "/driver/account", label: "Account" },
];

export default function DriverLayout({ children }: LayoutProps<"/driver">) {
  return (
    <AppShell tabs={TABS} signOut={{ endpoint: "/api/auth/logout", to: "/login" }}>
      {children}
    </AppShell>
  );
}
