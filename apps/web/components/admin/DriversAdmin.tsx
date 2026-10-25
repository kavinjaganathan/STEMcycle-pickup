"use client";

import { useState } from "react";
import { Button, Card, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { AdminDriver, DriverStatus } from "@/lib/db/admin";
import { formatBlocks, formatSlotDate } from "@/lib/format";
import { formatPhone } from "@/lib/validation";
import { InviteLink } from "./InviteLink";
import { useLoad } from "./useLoad";

const GROUPS: { status: DriverStatus; title: string; empty: string }[] = [
  { status: "pending", title: "Waiting for approval", empty: "No sign-ups waiting." },
  { status: "active", title: "Active drivers", empty: "No active drivers yet." },
  { status: "disabled", title: "Turned off", empty: "None." },
];

export function DriversAdmin({ inviteUrl }: { inviteUrl: string | null }) {
  const { data, error, setError, reload } = useLoad(
    "/api/admin/drivers",
    (b: { drivers: AdminDriver[] }) => b.drivers,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function update(d: AdminDriver, status: DriverStatus, capacity = d.capacity_boxes) {
    setBusy(d.id);
    setNotice(null);
    setError(null);
    try {
      const res = await api<{ emailed: boolean }>(`/api/admin/drivers/${d.id}`, {
        method: "PATCH",
        body: { status, capacity_boxes: capacity },
      });
      if (status === "active" && d.status === "pending")
        setNotice(
          `${d.full_name} is approved${res.emailed ? " and we emailed them" : ", but the email failed"}.`,
        );
      await reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Admin" title="Drivers" />
      <InviteLink url={inviteUrl} />
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-10">
          {GROUPS.map((g) => {
            const list = data.filter((d) => d.status === g.status);
            if (g.status === "disabled" && list.length === 0) return null;
            return (
              <section key={g.status} aria-labelledby={`g-${g.status}`}>
                <h2 id={`g-${g.status}`} className="mb-3 text-xl font-extrabold tracking-tight">
                  {g.title} <span className="text-base font-bold text-brand">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">{g.empty}</p>
                ) : (
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {list.map((d) => (
                      <li key={d.id}>
                        <DriverCard d={d} busy={busy === d.id} onUpdate={update} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function DriverCard({
  d,
  busy,
  onUpdate,
}: {
  d: AdminDriver;
  busy: boolean;
  onUpdate: (d: AdminDriver, status: DriverStatus, capacity?: number) => void;
}) {
  const [capacity, setCapacity] = useState(String(d.capacity_boxes));
  const capId = `cap-${d.id}`;
  const changed = Number(capacity) !== d.capacity_boxes && Number(capacity) >= 1;
  return (
    <Card className="h-full">
      <article aria-label={d.full_name || d.email}>
        <h3 className="text-lg font-bold">{d.full_name || "(no name)"}</h3>
        <p className="text-sm break-all">
          <a className="underline" href={`mailto:${d.email}`}>
            {d.email}
          </a>
          {d.phone && (
            <>
              {" · "}
              <a className="underline" href={`tel:+1${d.phone}`}>
                {d.phone.length === 10 ? formatPhone(d.phone) : d.phone}
              </a>
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={capId} className="mb-1 block text-sm font-bold">
              Capacity (boxes)
            </label>
            <input
              id={capId}
              type="number"
              min={1}
              max={200}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </div>
          {changed && (
            <Button disabled={busy} onClick={() => onUpdate(d, d.status, Number(capacity))}>
              Save capacity
            </Button>
          )}
        </div>
        {d.status === "active" && (
          <div className="mt-3 text-sm">
            <p className="font-bold">Upcoming hours</p>
            {d.availability.length === 0 ? (
              <p className="text-muted">None set.</p>
            ) : (
              <ul className="text-muted">
                {d.availability.slice(0, 4).map((a) => (
                  <li key={a.date}>
                    {formatSlotDate(a.date, "short")}: {formatBlocks(a.hours)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {d.status !== "active" && (
            <Button variant="primary" disabled={busy} onClick={() => onUpdate(d, "active")}>
              {d.status === "pending" ? "Approve" : "Turn back on"}
            </Button>
          )}
          {d.status !== "disabled" && (
            <Button variant="danger" disabled={busy} onClick={() => onUpdate(d, "disabled")}>
              {d.status === "pending" ? "Decline" : "Turn off"}
            </Button>
          )}
        </div>
      </article>
    </Card>
  );
}
