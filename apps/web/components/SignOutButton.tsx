"use client";

import { useState } from "react";
import { withBase } from "@/lib/base-path";

export function SignOutButton({ endpoint, to }: { endpoint: string; to: string }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch(withBase(endpoint), { method: "POST" }).catch(() => {});
    // Full navigation so no personal data stays in client memory after sign-out.
    window.location.assign(withBase(to));
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex min-h-10 items-center rounded-[2px] border border-ink px-4 text-sm font-bold transition-colors hover:bg-ink hover:text-white disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
