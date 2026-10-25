import { describe, expect, it } from "vitest";
import {
  directionsUrl,
  MAX_WAYPOINTS,
  RouteLinkError,
  routeSegments,
  type NamedPoint,
} from "@/lib/maps";

const depot: NamedPoint = { label: "Depot", lat: 33.1497, lng: -96.8226 };
const stops = (n: number): NamedPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    label: `Stop ${i + 1}`,
    lat: 33 + i / 100,
    lng: -96.7 - i / 100,
  }));
const coord = (p: NamedPoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Ordered list of every point a Google Maps URL visits. */
function visits(url: string): string[] {
  const q = new URL(url).searchParams;
  expect(q.get("api")).toBe("1");
  expect(q.get("travelmode")).toBe("driving");
  const wps = q.get("waypoints")?.split("|") ?? [];
  expect(wps.length).toBeLessThanOrEqual(MAX_WAYPOINTS);
  return [...(q.get("origin") ? [q.get("origin")!] : []), ...wps, q.get("destination")!];
}

describe("Google Maps route links", () => {
  it("sends depot, every stop in order, and the return in one link when it fits", () => {
    const route = [depot, ...stops(5), depot];
    const [seg, ...rest] = routeSegments(route);
    expect(rest).toEqual([]);
    expect(seg).toMatchObject({ part: 1, from: "Depot", to: "Depot", stops: 7 });
    expect(visits(seg.url)).toEqual(route.map(coord));
    expect(seg.url.startsWith("https://www.google.com/maps/dir/?api=1&origin=")).toBe(true);
    expect(seg.url).toContain("%7C"); // waypoint separator is encoded
  });

  it("splits long routes into consecutive parts without dropping or reordering stops", () => {
    const route = [depot, ...stops(23), depot]; // 25 points
    const segs = routeSegments(route);
    expect(segs.map((s) => [s.from, s.to])).toEqual([
      ["Depot", "Stop 10"],
      ["Stop 10", "Stop 20"],
      ["Stop 20", "Depot"],
    ]);
    // Joining the parts (each starts where the last ended) gives the whole route.
    const joined = segs.flatMap((s, i) => visits(s.url).slice(i === 0 ? 0 : 1));
    expect(joined).toEqual(route.map(coord));
  });

  it("can start from the phone's current location without asking for it", () => {
    const route = [...stops(12), depot]; // remaining stops, then home
    const segs = routeSegments(route, { fromCurrentLocation: true });
    expect(new URL(segs[0].url).searchParams.get("origin")).toBeNull();
    expect(segs[0].from).toBe("Your location");
    const joined = segs.flatMap((s, i) => visits(s.url).slice(i === 0 ? 0 : 1));
    expect(joined).toEqual(route.map(coord));
  });

  it("handles tiny and invalid routes explicitly", () => {
    expect(routeSegments([depot])).toEqual([]);
    expect(() => routeSegments([depot, { label: "Stop 1", lat: NaN, lng: 0 }])).toThrow(
      RouteLinkError,
    );
    expect(() => routeSegments([depot, { label: "Stop 1", lat: 0, lng: 0 }])).toThrow(/Stop 1/);
    expect(directionsUrl({ destination: depot })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=33.149700%2C-96.822600&travelmode=driving",
    );
  });
});
