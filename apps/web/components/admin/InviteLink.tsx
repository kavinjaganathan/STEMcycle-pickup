"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** The driver invite link, for the admin to share with new volunteers. */
export function InviteLink({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="invite-title" className="mb-8 border-l-4 border-brand bg-tint p-4">
      <h2 id="invite-title" className="font-bold">
        Invite a driver
      </h2>
      {url ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Send this link to new volunteers. Sign-up only works through it, and you still approve
            every account below.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="invite-url" className="sr-only">
              Driver invite link
            </label>
            <input
              id="invite-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-[2px] border border-field bg-white px-3 py-2 text-sm"
            />
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Sign-up is open to anyone who has the /signup address (you still approve every account).
          To require an invite link, set DRIVER_INVITE_CODE in the hosting settings.
        </p>
      )}
    </section>
  );
}
