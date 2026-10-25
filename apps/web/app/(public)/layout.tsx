import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

const TABS = [
  { href: "/", label: "Schedule a pickup", exact: true },
  { href: "/contact", label: "Contact us" },
];

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader tabs={TABS} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p className="mr-auto">
            We use your details only to schedule your pickup and never share them.
          </p>
          <Link href="/contact" className="font-bold text-ink underline-offset-4 hover:underline">
            Contact us
          </Link>
          <Link href="/login" className="underline-offset-4 hover:underline">
            Volunteer sign in
          </Link>
        </div>
      </footer>
    </>
  );
}
