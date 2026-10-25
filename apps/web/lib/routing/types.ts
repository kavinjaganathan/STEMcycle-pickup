/** Same shapes as services/solver (times are seconds since midnight). */
export type Job = {
  id: string;
  node: number;
  demand: number;
  service: number;
  tw: [number, number];
  /** Vehicles allowed to serve this job (undefined = any). */
  vehicles?: string[];
};

export type Vehicle = {
  id: string;
  start_node: number;
  end_node: number;
  capacity: number;
  shift_start: number;
  max_duration: number;
  /** Latest time back at the end depot. */
  shift_end?: number;
};

export type Problem = {
  durations: number[][];
  jobs: Job[];
  vehicles: Vehicle[];
  time_limit_seconds?: number;
};

export type SolvedStop = { job_id: string; arrival: number; departure: number };
export type SolvedRoute = {
  vehicle_id: string;
  start: number;
  end: number;
  load: number;
  stops: SolvedStop[];
};
export type Solution = { status: string; routes: SolvedRoute[]; unassigned: string[] };

export type LatLng = { lat: number; lng: number };

export function timeToSec(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export function secToTime(sec: number): string {
  const s = Math.max(0, Math.min(Math.round(sec), 24 * 3600 - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
