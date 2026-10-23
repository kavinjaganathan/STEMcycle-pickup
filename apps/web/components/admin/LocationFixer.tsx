"use client";

import type { AdminPickup } from "@/lib/db/admin";

/** Placeholder until Phase 3 adds the map-based location fixer. */
export function LocationFixer({
  onClose,
}: {
  pickup: AdminPickup;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fix location"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="rounded-xl bg-surface p-4">
        <p>Location fixing arrives with geocoding.</p>
        <button type="button" onClick={onClose} className="mt-3 underline">
          Close
        </button>
      </div>
    </div>
  );
}
