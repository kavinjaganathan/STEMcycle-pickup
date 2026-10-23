import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand"
      >
        Go to the pickup form
      </Link>
    </main>
  );
}
