import type { GeocodeStatus, PickupStatus, TextbookType } from "@/lib/shared";
import type { Rpc } from "./repo";

export type RoutingInputs = {
  settings: {
    depot_name: string;
    depot_address: string;
    depot_lat: number | null;
    depot_lng: number | null;
    service_min_base: number;
    service_min_per_50_books: number;
    max_route_min: number;
    return_buffer_min: number;
  };
  drivers: { id: string; full_name: string; capacity_boxes: number; hours: number[] }[];
  pickups: {
    id: string;
    slot_hour: number;
    est_boxes: number;
    book_count: number;
    lat: number | null;
    lng: number | null;
    geocode_status: GeocodeStatus;
    pinned_driver_id: string | null;
  }[];
};

export type Depot = { name: string; address: string; lat: number; lng: number };

export type SavePlanInput = {
  plan_date: string;
  solver: "ortools" | "fallback" | "none";
  matrix_provider: string;
  depot: Depot | null;
  unassigned: { pickup_id: string; reason: string }[];
  routes: {
    driver_id: string;
    driver_name: string;
    color: string;
    start_at: string;
    end_at: string;
    total_seconds: number;
    total_meters: number | null;
    total_boxes: number;
    geometry: [number, number][];
    stops: { pickup_id: string; seq: number; eta: string; depart: string }[];
  }[];
};

export type Claim = { weekend: string; dirty_at: string | null; final: boolean };

export type PlanStop = {
  id: string;
  seq: number;
  eta: string;
  depart: string;
  pickup_id: string;
  name: string;
  phone: string;
  address_line: string;
  city: string;
  zip: string;
  textbook_type: TextbookType;
  book_count: number;
  est_boxes: number;
  notes: string | null;
  status: PickupStatus;
  lat: number;
  lng: number;
  slot_hour: number;
  pinned: boolean;
};

export type PlanRoute = {
  id: string;
  driver_id: string | null;
  driver_name: string;
  color: string;
  start_at: string;
  end_at: string;
  total_seconds: number;
  total_meters: number | null;
  total_boxes: number;
  geometry: [number, number][];
  stops: PlanStop[];
};

export type RoutePlan = {
  id: string;
  plan_date: string;
  solver: "ortools" | "fallback" | "none";
  matrix_provider: string;
  created_at: string;
  depot: Depot | null;
  routes: PlanRoute[];
};

export type UnassignedPickup = {
  pickup_id: string;
  name: string;
  address_line: string;
  city: string;
  slot_hour: number;
  book_count: number;
  est_boxes: number;
  geocode_status: GeocodeStatus;
  reason: string | null;
  pinned_driver_id: string | null;
};

export type WeekendDay = {
  date: string;
  plan: RoutePlan | null;
  unassigned: UnassignedPickup[];
  drivers: { id: string; full_name: string; capacity_boxes: number; hours: number[] }[];
};

export type AdminWeekend = {
  weekend_date: string;
  lock_at: string;
  locked_at: string | null;
  dirty_at: string | null;
  running: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  days: WeekendDay[];
};

/** Routing jobs (service role). */
export function createRoutingApi(rpc: Rpc) {
  return {
    claimWork: async (now: Date, quietSeconds: number) =>
      (await rpc("claim_routing_work", {
        p_now: now.toISOString(),
        p_quiet_seconds: quietSeconds,
      })) as Claim[],
    claimWeekend: async (weekend: string, now: Date) =>
      ((await rpc("claim_weekend", { p_weekend: weekend, p_now: now.toISOString() })) ??
        null) as Claim | null,
    finishRun: (c: Claim, status: string) =>
      rpc("finish_routing_run", {
        p_weekend: c.weekend,
        p_dirty_at: c.dirty_at,
        p_status: status,
        p_final: c.final,
      }),
    inputs: async (date: string) =>
      (await rpc("routing_inputs", { p_date: date })) as RoutingInputs,
    savePlan: async (plan: SavePlanInput) =>
      (await rpc("save_route_plan", { p: plan })) as { id: string; changed_driver_ids: string[] },
    driverContacts: async (weekend: string, driverIds: string[] | null) =>
      (await rpc("weekend_driver_contacts", {
        p_weekend: weekend,
        p_driver_ids: driverIds,
      })) as { id: string; email: string; full_name: string }[],
    weekend: async (weekend: string) =>
      (await rpc("admin_get_weekend", { p_weekend: weekend })) as AdminWeekend,
  };
}

export type RoutingApi = ReturnType<typeof createRoutingApi>;
