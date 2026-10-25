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
      <p className="eyebrow">Your pickup</p>
      <h1 className="display mt-1 text-4xl">Cancel your pickup</h1>
      <div className="panel mt-8 max-w-xl p-5 sm:p-8">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <CancelPanel />
        </Suspense>
      </div>
    </>
  );
}
