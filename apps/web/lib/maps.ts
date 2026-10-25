/**
 * Google Maps / Apple Maps hand-off links. These use the public "Maps URLs"
 * format (https://developers.google.com/maps/documentation/urls/get-started),
 * which needs no API key and opens the Google Maps app on phones when installed.
 *
 * Google documents a limit of 9 waypoints between origin and destination, so a
 * longer route is split into consecutive segments: each one starts where the
 * previous one ended, and every stop appears in exactly one segment, in order.
 */
export type Point = { lat: number; lng: number };
export type NamedPoint = Point & { label: string };

export const MAX_WAYPOINTS = 9;
const BASE = "https://www.google.com/maps/dir/?api=1";

export function isValidPoint(p: Partial<Point> | null | undefined): p is Point {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

const ll = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Directions URL. Without an origin, Google Maps starts from the device's current location. */
export function directionsUrl(r: { origin?: Point; destination: Point; waypoints?: Point[] }) {
  const params = [
    r.origin ? `origin=${encodeURIComponent(ll(r.origin))}` : "",
    `destination=${encodeURIComponent(ll(r.destination))}`,
    r.waypoints?.length ? `waypoints=${encodeURIComponent(r.waypoints.map(ll).join("|"))}` : "",
    "travelmode=driving",
  ].filter(Boolean);
  return `${BASE}&${params.join("&")}`;
}

export type RouteSegment = {
  /** 1-based part number. */
  part: number;
  from: string;
  to: string;
  /** How many points in this part (including both ends). */
  stops: number;
  url: string;
};

/**
 * Splits an ordered route into Google Maps links of at most MAX_WAYPOINTS
 * intermediate stops each. `points` is the full ordered route, origin first and
 * destination last. With `fromCurrentLocation`, the first point is ignored as
 * an origin and the first part starts wherever the phone is.
 */
export function routeSegments(
  points: NamedPoint[],
  opts: { fromCurrentLocation?: boolean; maxWaypoints?: number } = {},
): RouteSegment[] {
  const max = opts.maxWaypoints ?? MAX_WAYPOINTS;
  if (points.length < 2) return [];
  const bad = points.find((p) => !isValidPoint(p as Partial<Point>)) as NamedPoint | undefined;
  if (bad) throw new RouteLinkError(`"${bad.label}" has no valid location.`);

  const segments: RouteSegment[] = [];
  let start = 0;
  while (start < points.length - 1) {
    const useCurrent = segments.length === 0 && !!opts.fromCurrentLocation;
    // From the current location the start point is itself a waypoint, so one fewer fits.
    const end = Math.min(start + (useCurrent ? max : max + 1), points.length - 1);
    segments.push({
      part: segments.length + 1,
      from: useCurrent ? "Your location" : points[start].label,
      to: points[end].label,
      stops: end - start + 1,
      url: directionsUrl({
        origin: useCurrent ? undefined : points[start],
        destination: points[end],
        // From the current location, the "start" point becomes the first stop.
        waypoints: points.slice(useCurrent ? start : start + 1, end),
      }),
    });
    start = end;
  }
  return segments;
}

export class RouteLinkError extends Error {}

export function googleMapsUrl(dest: Point): string {
  return directionsUrl({ destination: dest });
}

export function appleMapsUrl(dest: Point): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(ll(dest))}&dirflg=d`;
}
