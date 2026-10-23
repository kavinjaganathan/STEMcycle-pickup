"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">Sorry about that. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand"
      >
        Try again
      </button>
    </main>
  );
}
