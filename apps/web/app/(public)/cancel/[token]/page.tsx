import type { Metadata } from "next";
import { Suspense } from "react";
import { CancelPanel } from "./CancelPanel";

export const metadata: Metadata = {
  title: "Cancel pickup",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CancelPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Cancel your pickup</h1>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <CancelPanel />
        </Suspense>
      </div>
    </>
  );
}
