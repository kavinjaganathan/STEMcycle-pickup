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
import { addDays } from "@/lib/dates";
import { formatHourRange, formatSlotDate, TEXTBOOK_LABEL } from "@/lib/format";
import { TEXTBOOK_TYPES, type TextbookType } from "@/lib/shared";
import { formatPhone } from "@/lib/validation";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Issue = "all" | "unassigned" | "location";

export function PickupsAdmin({
  renderExtraActions,
}: {
  /** Extra per-pickup actions (e.g. location fixing), given a reload callback. */
  renderExtraActions?: (p: AdminPickup, reload: () => Promise<void>) => React.ReactNode;
} = {}) {
  const [from, setFrom] = useState(localToday);
  const [to, setTo] = useState(() => addDays(localToday(), 28));
  const [statuses, setStatuses] = useState<PickupStatus[]>(["pending", "scheduled"]);
  const [type, setType] = useState<TextbookType | "">("");
  const [city, setCity] = useState("");
  const [issue, setIssue] = useState<Issue>("all");
  const [pickups, setPickups] = useState<AdminPickup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const cities = useMemo(() => [...new Set((pickups ?? []).map((p) => p.city))].sort(), [pickups]);

  const shown = useMemo(
    () =>
      (pickups ?? []).filter(
        (p) =>
          (!type || p.textbook_type === type) &&
          (!city || p.city === city) &&
          (issue === "all" ||
            (issue === "unassigned" && p.status === "pending") ||
            (issue === "location" && p.geocode_status !== "ok")),
      ),
    [pickups, type, city, issue],
  );

  const totals = useMemo(
    () => ({
      count: shown.length,
      books: shown.reduce((n, p) => n + (p.status === "cancelled" ? 0 : p.book_count), 0),
      boxes: shown.reduce((n, p) => n + (p.status === "cancelled" ? 0 : p.est_boxes), 0),
      unassigned: shown.filter((p) => p.status === "pending").length,
    }),
    [shown],
  );

  return (
    <>
      <PageHeader eyebrow="Admin" title="Pickups">
        <a
          href={`/api/admin/pickups/export?${query}`}
          className="inline-flex min-h-10 items-center rounded-[2px] border border-ink px-4 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
          download
        >
          Export CSV
        </a>
      </PageHeader>

      <Card className="mb-6">
        <form
          className="grid grid-cols-2 gap-4 md:grid-cols-[repeat(5,minmax(0,1fr))]"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filter pickups"
        >
          <FilterField id="f-from" label="From">
            <input
              id="f-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </FilterField>
          <FilterField id="f-to" label="To">
            <input
              id="f-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </FilterField>
          <FilterField id="f-type" label="Textbooks">
            <select
              id="f-type"
              value={type}
              onChange={(e) => setType(e.target.value as TextbookType | "")}
              className={inputClass}
            >
              <option value="">All types</option>
              {TEXTBOOK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TEXTBOOK_LABEL[t]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField id="f-city" label="City">
            <select
              id="f-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FilterField>
          <FilterField id="f-issue" label="Show">
            <select
              id="f-issue"
              value={issue}
              onChange={(e) => setIssue(e.target.value as Issue)}
              className={inputClass}
            >
              <option value="all">Everything</option>
              <option value="unassigned">Unassigned only</option>
              <option value="location">Location problems</option>
            </select>
          </FilterField>
          <fieldset className="col-span-2 md:col-span-5">
            <legend className="mb-1.5 text-sm font-bold">Status</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PICKUP_STATUSES.map((s) => (
                <label key={s} className="flex min-h-6 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s)}
                    onChange={() =>
                      setStatuses((cur) =>
                        cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
                      )
                    }
                    className="h-4 w-4 accent-[var(--purple)]"
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
          <dl
            className="mb-6 grid grid-cols-2 border-t border-ink sm:grid-cols-4"
            aria-live="polite"
          >
            <Stat term="Pickups" value={totals.count} />
            <Stat term="Books (approx.)" value={totals.books} />
            <Stat term="Boxes (est.)" value={totals.boxes} />
            <Stat term="Unassigned" value={totals.unassigned} alert={totals.unassigned > 0} />
          </dl>
          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">No pickups match these filters.</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {shown.map((p) => (
                <li key={p.id}>
                  <PickupRow
                    p={p}
                    busy={busyId === p.id}
                    onStatus={(s) => setStatus(p, s)}
                    extra={renderExtraActions?.(p, load)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({ term, value, alert }: { term: string; value: number; alert?: boolean }) {
  return (
    <div className="pt-3 pr-4 pb-1">
      <dt className="text-xs font-bold tracking-widest text-muted uppercase">{term}</dt>
      <dd
        className={`mt-1 text-3xl font-black tracking-tight ${alert ? "text-danger" : "text-ink"}`}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function PickupRow({
  p,
  busy,
  onStatus,
  extra,
}: {
  p: AdminPickup;
  busy: boolean;
  onStatus: (s: PickupStatus) => void;
  extra?: React.ReactNode;
}) {
  const open = p.status === "pending" || p.status === "scheduled";
  return (
    <article className="border border-line bg-white p-4" aria-label={`Pickup for ${p.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <GeocodeBadge status={p.geocode_status} />
            <span className="text-sm font-bold">
              {formatSlotDate(p.slot_date, "short")}, {formatHourRange(p.slot_hour)}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold">{p.name}</h2>
          <p className="text-sm">
            {p.address_line}, {p.city} {p.zip}
          </p>
          <p className="text-sm text-muted">
            {TEXTBOOK_LABEL[p.textbook_type]} · about {p.book_count} books (~{p.est_boxes}{" "}
            {p.est_boxes === 1 ? "box" : "boxes"})
          </p>
          {p.status === "scheduled" && p.driver_name && (
            <p className="mt-1 text-sm">
              Driver: <strong>{p.driver_name}</strong>
              {p.pinned_driver_id && " (assigned by admin)"}
            </p>
          )}
          {p.status === "pending" && p.route_issue && (
            <p className="mt-1 text-sm font-bold text-danger">{p.route_issue}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {extra}
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
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-bold text-muted">Contact and notes</summary>
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
