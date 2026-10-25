"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatSlot } from "@/lib/format";
import type { CancelBody } from "@/lib/pickups/service";

type View =
  | { kind: "loading" }
  | { kind: "confirm"; body: Extract<CancelBody, { slot: unknown }> }
  | { kind: "done" }
  | { kind: "error"; message: string };

async function post(token: string, action: "lookup" | "cancel"): Promise<CancelBody> {
  const res = await fetch("/api/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action }),
  });
  return (await res.json()) as CancelBody;
}

export function CancelPanel() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Look up first and ask for confirmation, so link scanners in email
    // clients can't cancel a pickup just by opening the link.
    post(token, "lookup")
      .then((body) => {
        if (!body.ok) setView({ kind: "error", message: body.error });
        else if ("slot" in body) setView({ kind: "confirm", body });
      })
      .catch(() =>
        setView({ kind: "error", message: "We couldn't reach the server. Please try again." }),
      );
  }, [token]);

  useEffect(() => {
    if (view.kind === "done" || view.kind === "error") resultRef.current?.focus();
  }, [view.kind]);

  async function cancel() {
    setBusy(true);
    try {
      const body = await post(token, "cancel");
      setView(body.ok ? { kind: "done" } : { kind: "error", message: body.error });
    } catch {
      setView({ kind: "error", message: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "loading") return <p className="text-muted">Loading your pickup…</p>;

  if (view.kind === "error" || view.kind === "done") {
    return (
      <p ref={resultRef} tabIndex={-1} role="status" className="text-lg">
        {view.kind === "done"
          ? "Your pickup has been cancelled. Thanks for letting us know!"
          : view.message}
      </p>
    );
  }

  const { state, slot } = view.body;
  if (state === "cancelled") return <p role="status">This pickup was already cancelled.</p>;
  if (state === "picked_up")
    return <p role="status">These books have already been picked up — thank you for donating!</p>;

  return (
    <div className="space-y-4">
      <p>
        Your pickup is scheduled for <strong>{formatSlot(slot)}</strong>.
      </p>
      <p>Do you want to cancel it?</p>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="min-h-12 w-full rounded-[2px] border border-danger bg-danger px-6 font-bold text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Cancelling…" : "Yes, cancel my pickup"}
      </button>
    </div>
  );
}
