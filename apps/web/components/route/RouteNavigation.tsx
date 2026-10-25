"use client";

import {
  MAX_WAYPOINTS,
  RouteLinkError,
  routeSegments,
  type NamedPoint,
  type RouteSegment,
} from "@/lib/maps";

type NavStop = { seq: number; lat: number; lng: number; status: string };

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-[2px] border px-4 text-sm font-bold transition-colors";

/**
 * "Open route in Google Maps": the whole route (depot, every stop in order,
 * back to the depot), split into consecutive parts when it has more stops than
 * Google Maps accepts in one link. Cancelled stops are left out and said so.
 */
export function RouteNavigation({
  depot,
  stops,
  showRemaining = false,
}: {
  depot: { name: string; lat: number; lng: number } | null;
  stops: NavStop[];
  /** Also offer "continue from my location" through the stops not yet picked up. */
  showRemaining?: boolean;
}) {
  const active = stops.filter((s) => s.status !== "cancelled");
  const skipped = stops.length - active.length;
  const remaining = active.filter((s) => s.status !== "picked_up");
  const home: NamedPoint[] = depot
    ? [{ label: depot.name || "Depot", lat: depot.lat, lng: depot.lng }]
    : [];
  const asPoints = (list: NavStop[]): NamedPoint[] =>
    list.map((s) => ({ label: `Stop ${s.seq}`, lat: s.lat, lng: s.lng }));

  let full: RouteSegment[] = [];
  let rest: RouteSegment[] = [];
  let error: string | null = null;
  try {
    full = routeSegments([...home, ...asPoints(active), ...home]);
    if (showRemaining && remaining.length > 0 && remaining.length < active.length)
      rest = routeSegments([...asPoints(remaining), ...home], { fromCurrentLocation: true });
  } catch (err) {
    error = err instanceof RouteLinkError ? err.message : "A stop has no valid location.";
  }

  if (error)
    return (
      <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm">
        Can&apos;t build the Google Maps route: {error} Use the stop list below, or ask the admin to
        fix the location.
      </p>
    );
  if (full.length === 0) return null;

  return (
    <div className="space-y-3">
      <Segments segments={full} primary title="Open route in Google Maps" />
      {rest.length > 0 && (
        <Segments
          segments={rest}
          title={`Continue from my location (${remaining.length} ${remaining.length === 1 ? "stop" : "stops"} left)`}
        />
      )}
      <p className="text-xs leading-relaxed text-muted">
        Opens Google Maps with every stop in the order shown below
        {depot ? `, starting and ending at ${depot.name || "the depot"}` : ""}.
        {full.length > 1 &&
          ` Google Maps takes up to ${MAX_WAYPOINTS} stops per link, so the route is in ${full.length} parts. When you reach the end of one part, open the next.`}
        {skipped > 0 &&
          ` ${skipped} cancelled ${skipped === 1 ? "stop is" : "stops are"} left out.`}
      </p>
    </div>
  );
}

function Segments({
  segments,
  title,
  primary = false,
}: {
  segments: RouteSegment[];
  title: string;
  primary?: boolean;
}) {
  const style = primary
    ? "border-ink bg-ink text-white hover:border-brand-strong hover:bg-brand-strong"
    : "border-ink bg-white text-ink hover:bg-ink hover:text-white";
  if (segments.length === 1)
    return (
      <a
        href={segments[0].url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${linkClass} ${style} w-full sm:w-auto`}
      >
        {title}
      </a>
    );
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{title}</p>
      <ol className="grid gap-2">
        {segments.map((s) => (
          <li key={s.part}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} ${style} w-full justify-between gap-3`}
            >
              <span>
                Part {s.part} of {segments.length}
              </span>
              <span className="font-semibold">
                {s.from} → {s.to}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
