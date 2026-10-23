import Link from "next/link";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <span aria-hidden="true" className="text-xl">
            📚
          </span>
          <Link href="/" className="font-semibold tracking-tight">
            StemCycle Pickup
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted">
        We use your details only to schedule your pickup and never share them.
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <Link href="/login" className="underline">
          Volunteer sign in
        </Link>
      </footer>
    </>
  );
}
