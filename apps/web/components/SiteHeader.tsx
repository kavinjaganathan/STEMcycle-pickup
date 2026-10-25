import { Suspense } from "react";
import Link from "next/link";
import { ActiveTabs, TabList, type TabItem } from "./Tabs";

export type { TabItem };

/** Wordmark + folder-tab navigation, as on the team site. */
export function SiteHeader({ tabs, right }: { tabs: TabItem[]; right?: React.ReactNode }) {
  return (
    <header className="relative bg-white after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-6 px-4 pt-3 sm:px-6">
        <Link
          href="/"
          className="mb-3 flex items-center gap-2 text-lg font-extrabold tracking-tight"
        >
          <Logo />
          StemCycle
        </Link>
        {right && <div className="mb-3 ml-auto flex items-center gap-2 sm:order-last">{right}</div>}
        <nav
          aria-label="Main"
          className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
        >
          {/* The active tab depends on the URL, which isn't known at prerender time. */}
          <Suspense fallback={<TabList tabs={tabs} active={null} />}>
            <ActiveTabs tabs={tabs} />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="#111" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#8f3ba5" strokeWidth="4" />
    </svg>
  );
}
