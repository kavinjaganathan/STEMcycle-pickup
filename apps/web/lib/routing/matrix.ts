import "server-only";
import { env } from "@/lib/env";
import { userAgent } from "@/lib/geocode";
import { log } from "@/lib/logger";
import type { LatLng } from "./types";

export type Matrix = {
  durations: number[][]; // seconds
  distances: number[][] | null; // meters
  provider: "ors" | "osrm" | "fake";
};

export class RoutingError extends Error {}

const UNREACHABLE = 10 * 3600; // treated as "too far" by the solvers
const ORS_URL = "https://api.openrouteservice.org";
const ORS_MAX_CELLS = 3500; // free-tier limit per matrix request

/**
 * Road-network travel times between all points. Tries OpenRouteService (if
 * ORS_API_KEY is set), then OSRM. Never falls back to straight-line distance
 * in production; ROUTING_PROVIDER=fake exists for local tests only.
 */
export async function buildMatrix(points: LatLng[]): Promise<Matrix> {
  if (process.env.ROUTING_PROVIDER === "fake") {
    if (env.isHosted) throw new Error("The fake routing provider is for local development only");
    return fakeMatrix(points);
  }
  if (process.env.ORS_API_KEY) {
    try {
      return await orsMatrix(points, process.env.ORS_API_KEY);
    } catch (err) {
      log("warn", "ors_matrix_failed", { err });
    }
  }
  try {
    return await osrmMatrix(points);
  } catch (err) {
    log("warn", "osrm_matrix_failed", { err });
  }
  throw new RoutingError(
    "Couldn't get road travel times right now. Please try again in a few minutes.",
  );
}

function clean(row: (number | null)[], fallback: number): number[] {
  return row.map((v) => (v === null || !Number.isFinite(v) ? fallback : Math.round(v)));
}

export async function orsMatrix(points: LatLng[], key: string): Promise<Matrix> {
  const n = points.length;
  const rowsPerRequest = Math.max(1, Math.floor(ORS_MAX_CELLS / n));
  const durations: number[][] = [];
  const distances: number[][] = [];
  const locations = points.map((p) => [p.lng, p.lat]);
  for (let from = 0; from < n; from += rowsPerRequest) {
    const sources = Array.from({ length: Math.min(rowsPerRequest, n - from) }, (_, i) => from + i);
    // POST body, so coordinates never appear in a URL.
    const res = await fetch(`${ORS_URL}/v2/matrix/driving-car`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ locations, sources, metrics: ["duration", "distance"], units: "m" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ors matrix http ${res.status}`);
    const data = (await res.json()) as {
      durations: (number | null)[][];
      distances: (number | null)[][];
    };
    for (const row of data.durations) durations.push(clean(row, UNREACHABLE));
    for (const row of data.distances) distances.push(clean(row, 0));
  }
  return { durations, distances, provider: "ors" };
}

export async function osrmMatrix(points: LatLng[]): Promise<Matrix> {
  const base = process.env.OSRM_URL ?? "https://router.project-osrm.org";
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const n = points.length;
  const block = 25;
  const durations: number[][] = [];
  const distances: number[][] = [];
  for (let from = 0; from < n; from += block) {
    const sources = Array.from({ length: Math.min(block, n - from) }, (_, i) => from + i).join(";");
    const res = await fetch(
      `${base}/table/v1/driving/${coords}?annotations=duration,distance&sources=${sources}`,
      // Workers send no User-Agent by default, and the OSRM demo answers 403 without one.
      { headers: { "User-Agent": userAgent() }, signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) throw new Error(`osrm table http ${res.status}`);
    const data = (await res.json()) as {
      code: string;
      durations: (number | null)[][];
      distances: (number | null)[][];
    };
    if (data.code !== "Ok") throw new Error(`osrm table ${data.code}`);
    for (const row of data.durations) durations.push(clean(row, UNREACHABLE));
    for (const row of data.distances ?? []) distances.push(clean(row, 0));
  }
  return { durations, distances: distances.length ? distances : null, provider: "osrm" };
}

/** Straight-line distance × 1.35 at 45 km/h. Local tests only. */
export function fakeMatrix(points: LatLng[]): Matrix {
  const distances = points.map((a) => points.map((b) => Math.round(haversine(a, b) * 1.35)));
  const durations = distances.map((row) => row.map((m) => Math.round(m / (45_000 / 3600))));
  return { durations, distances, provider: "fake" };
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
