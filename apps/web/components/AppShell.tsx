"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string };

/** Header + nav for the signed-in areas. */
export function AppShell({
  nav,
  userName,
  children,
}: {
  nav: NavItem[];
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full navigation so no personal data stays in client memory after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="font-semibold tracking-tight">
            <span aria-hidden="true">📚 </span>StemCycle
          </span>
          <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <ul className="flex flex-wrap gap-1">
              {nav.map((item) => {
                const active =
                  item.href === nav[0].href
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-md px-2.5 py-1.5 text-sm font-medium ${
                        active ? "bg-brand-soft text-text" : "text-muted hover:text-text"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/account" className="text-muted hover:text-text">
              {userName || "Account"}
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="rounded-md border border-border px-2.5 py-1.5 font-medium hover:bg-brand-soft"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
