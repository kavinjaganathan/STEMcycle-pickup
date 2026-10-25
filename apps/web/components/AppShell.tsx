import { Suspense } from "react";
import { SignOutButton } from "./SignOutButton";
import { SiteHeader, type TabItem } from "./SiteHeader";
import { Spinner } from "./ui";

/** Header + tabs + main area for the signed-in sections (driver, admin). */
export function AppShell({
  tabs,
  signOut,
  children,
}: {
  tabs: TabItem[];
  signOut: { endpoint: string; to: string };
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader tabs={tabs} right={<SignOutButton {...signOut} />} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {/* Pages read the session cookie, so they render per request. */}
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </main>
    </>
  );
}
