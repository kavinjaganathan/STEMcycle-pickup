"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = { href: string; label: string; exact?: boolean };

export function ActiveTabs({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  const active = tabs.find((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)));
  return <TabList tabs={tabs} active={active?.href ?? null} />;
}

export function TabList({ tabs, active }: { tabs: TabItem[]; active: string | null }) {
  return (
    <ul className="tabs">
      {tabs.map((t, i) => (
        <li key={t.href} className="tab" style={{ zIndex: tabs.length - i }}>
          <Link href={t.href} aria-current={active === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
