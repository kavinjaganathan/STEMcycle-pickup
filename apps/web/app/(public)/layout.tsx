import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

const TABS = [
  { href: "/", label: "Donate books", exact: true },
  { href: "/drive", label: "Drive with us" },
];

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader
        tabs={TABS}
        right={
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center rounded-[2px] border border-ink px-4 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
          >
            Sign in
          </Link>
        }
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p>We use your details only to schedule your pickup and never share them.</p>
          <Link href="/drive" className="font-bold text-ink underline-offset-4 hover:underline">
            Volunteer as a driver
          </Link>
        </div>
      </footer>
    </>
  );
}
