"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  GeocodeBadge,
  inputClass,
  Notice,
  PageHeader,
  Spinner,
  STATUS_LABEL,
  StatusBadge,
} from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import { PICKUP_STATUSES, type AdminPickup, type PickupStatus } from "@/lib/db/admin";
import { formatSlotDate, formatWindow } from "@/lib/format";
import { formatPhone } from "@/lib/validation";
import { addDays } from "@/lib/dates";
import { LocationFixer } from "./LocationFixer";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PickupsAdmin() {
  const [from, setFrom] = useState(localToday);
  const [to, setTo] = useState(() => addDays(localToday(), 14));
  const [statuses, setStatuses] = useState<PickupStatus[]>(["pending", "scheduled"]);
  const [pickups, setPickups] = useState<AdminPickup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fixing, setFixing] = useState<AdminPickup | null>(null);

  const query = useMemo(
    () => new URLSearchParams({ from, to, status: statuses.join(",") }).toString(),
    [from, to, statuses],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      setPickups((await api<{ pickups: AdminPickup[] }>(`/api/admin/pickups?${query}`)).pickups);
    } catch (err) {
      setError(errorText(err));
    }
  }, [query]);

  useEffect(() => {
    // Data fetch on filter change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function setStatus(p: AdminPickup, status: PickupStatus) {
    setBusyId(p.id);
    try {
      await api(`/api/admin/pickups/${p.id}`, { method: "PATCH", body: { status } });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function locate(p: AdminPickup) {
    setBusyId(p.id);
    try {
      await api(`/api/admin/pickups/${p.id}/geocode`, { method: "POST" });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggleStatus(s: PickupStatus) {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  const totals = useMemo(
    () => ({
      count: pickups?.length ?? 0,
      books: pickups?.reduce((n, p) => n + (p.status === "cancelled" ? 0 : p.book_count), 0) ?? 0,
      review:
        pickups?.filter((p) => p.geocode_status === "needs_review" || p.geocode_status === "failed")
          .length ?? 0,
    }),
    [pickups],
  );

  return (
    <>
      <PageHeader title="Pickups">
        <a
          href={`/api/admin/pickups/export?${query}`}
          className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold hover:bg-brand-soft"
          download
        >
          Export CSV
        </a>
      </PageHeader>

      <Card className="mb-4">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filter pickups"
        >
          <div>
            <label htmlFor="f-from" className="mb-1 block text-sm font-medium">
              From
            </label>
            <input
              id="f-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="f-to" className="mb-1 block text-sm font-medium">
              To
            </label>
            <input
              id="f-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Status</legend>
            <div className="flex flex-wrap gap-3">
              {PICKUP_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      </Card>

      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {pickups === null ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {totals.count} pickup{totals.count === 1 ? "" : "s"} · about{" "}
            {totals.books.toLocaleString()} books
            {totals.review > 0 && (
              <>
                {" "}
                · <strong className="text-danger">{totals.review} need a location check</strong>
              </>
            )}
          </p>
          {pickups.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">No pickups match these filters.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {pickups.map((p) => (
                <li key={p.id}>
                  <PickupRow
                    p={p}
                    busy={busyId === p.id}
                    onStatus={(s) => setStatus(p, s)}
                    onFixLocation={() => setFixing(p)}
                    onLocate={() => locate(p)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {fixing && (
        <LocationFixer
          pickup={fixing}
          onClose={() => setFixing(null)}
          onSaved={() => {
            setFixing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function PickupRow({
  p,
  busy,
  onStatus,
  onFixLocation,
  onLocate,
}: {
  p: AdminPickup;
  busy: boolean;
  onStatus: (s: PickupStatus) => void;
  onFixLocation: () => void;
  onLocate: () => void;
}) {
  const open = p.status === "pending" || p.status === "scheduled";
  return (
    <article
      className="rounded-xl border border-border bg-surface p-3 shadow-sm sm:p-4"
      aria-label={`Pickup for ${p.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <GeocodeBadge status={p.geocode_status} />
            <span className="text-sm text-muted">
              {formatSlotDate(p.slot_date)}, {formatWindow(p)}
            </span>
          </div>
          <h2 className="mt-1 font-semibold">{p.name}</h2>
          <p className="text-sm">
            {p.address_line}, {p.city} {p.zip}
          </p>
          <p className="text-sm text-muted">About {p.book_count} books</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.geocode_status === "pending" && open && (
            <Button size="sm" disabled={busy} onClick={onLocate}>
              Locate
            </Button>
          )}
          {(p.geocode_status === "needs_review" || p.geocode_status === "failed") && (
            <Button size="sm" onClick={onFixLocation}>
              Fix location
            </Button>
          )}
          {open && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => onStatus("picked_up")}
            >
              Mark picked up
            </Button>
          )}
          {open && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => onStatus("cancelled")}
            >
              Cancel
            </Button>
          )}
          {!open && (
            <Button size="sm" disabled={busy} onClick={() => onStatus("pending")}>
              Reopen
            </Button>
          )}
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Contact &amp; notes</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">Email</dt>
          <dd className="break-all">
            <a className="underline" href={`mailto:${p.email}`}>
              {p.email}
            </a>
          </dd>
          <dt className="text-muted">Phone</dt>
          <dd>
            <a className="underline" href={`tel:+1${p.phone}`}>
              {formatPhone(p.phone)}
            </a>
          </dd>
          {p.notes && (
            <>
              <dt className="text-muted">Notes</dt>
              <dd className="whitespace-pre-wrap">{p.notes}</dd>
            </>
          )}
        </dl>
      </details>
    </article>
  );
}
