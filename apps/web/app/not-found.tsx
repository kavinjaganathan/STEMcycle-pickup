import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md flex-1 px-4 py-16">
      <p className="eyebrow">404</p>
      <h1 className="display mt-1 text-3xl">Page not found</h1>
      <p className="mt-3 text-muted">That page doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-12 items-center rounded-[2px] border border-ink bg-ink px-6 font-bold text-white hover:border-brand-strong hover:bg-brand-strong"
      >
        Schedule a pickup
      </Link>
    </main>
  );
}
