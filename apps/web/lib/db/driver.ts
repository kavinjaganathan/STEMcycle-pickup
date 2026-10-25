import type { PickupStatus } from "@/lib/shared";
import type { Rpc } from "./repo";
import type { Depot, PlanRoute, PlanStop } from "./routing";

export type AvailabilityDay = { date: string; lock_at: string; hours: number[] };
export type Availability = {
  timezone: string;
  first_hour: number;
  last_hour: number;
  days: AvailabilityDay[];
};

export type DriverStop = PlanStop;
export type DriverRoute = PlanRoute;
export type DriverWeekend = {
  weekend_date: string;
  lock_at: string;
  locked: boolean;
  days: { date: string; depot: Depot | null; routes: DriverRoute[]; hours: number[] }[];
};

/** Driver SQL functions; `rpc` must run as the signed-in driver. */
export function createDriverApi(rpc: Rpc) {
  return {
    availability: async () => (await rpc("driver_get_availability")) as Availability,
    setAvailability: (date: string, hours: number[]) =>
      rpc("driver_set_availability", { p_date: date, p_hours: hours }),
    routes: async (weekend: string) =>
      (await rpc("driver_routes", { p_weekend: weekend })) as DriverWeekend,
    setStopStatus: async (stopId: string, pickedUp: boolean) =>
      (await rpc("driver_set_stop_status", { p_stop_id: stopId, p_picked_up: pickedUp })) as {
        ok: true;
        status: PickupStatus;
      },
  };
}
