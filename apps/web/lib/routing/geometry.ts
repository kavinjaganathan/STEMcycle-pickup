import "server-only";
import { userAgent } from "@/lib/geocode";
import { log } from "@/lib/logger";
import type { LatLng } from "./types";

const MAX_WAYPOINTS = 50;
const MAX_POINTS = 1500;

/**
 * Road-following line through the given points for the map. Falls back to
 * straight segments if no routing service answers (it's only a drawing).
 */
export async function routeLine(points: LatLng[]): Promise<[number, number][]> {
  const straight = points.map((p) => [round(p.lat), round(p.lng)] as [number, number]);
  if (points.length < 2 || process.env.ROUTING_PROVIDER === "fake") return straight;
  try {
    const parts: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS - 1) {
      const chunk = points.slice(i, i + MAX_WAYPOINTS);
      const line = process.env.ORS_API_KEY
        ? await orsLine(chunk, process.env.ORS_API_KEY)
        : await osrmLine(chunk);
      parts.push(...(parts.length ? line.slice(1) : line));
    }
    return downsample(parts);
  } catch (err) {
    log("warn", "route_geometry_failed", { err });
    return straight;
  }
}

async function orsLine(points: LatLng[], key: string): Promise<[number, number][]> {
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ors directions http ${res.status}`);
  const data = (await res.json()) as {
    features: { geometry: { coordinates: [number, number][] } }[];
  };
  return data.features[0].geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)]);
}

async function osrmLine(points: LatLng[]): Promise<[number, number][]> {
  const base = process.env.OSRM_URL ?? "https://router.project-osrm.org";
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const res = await fetch(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
    headers: { "User-Agent": userAgent() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`osrm route http ${res.status}`);
  const data = (await res.json()) as {
    routes: { geometry: { coordinates: [number, number][] } }[];
  };
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)]);
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

function downsample(pts: [number, number][]): [number, number][] {
  if (pts.length <= MAX_POINTS) return pts;
  const step = pts.length / MAX_POINTS;
  const out = Array.from({ length: MAX_POINTS }, (_, i) => pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}
