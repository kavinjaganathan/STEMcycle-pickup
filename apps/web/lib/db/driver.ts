import type { PickupStatus } from "./admin";
import type { Rpc } from "./repo";

export type DriverStop = {
  id: string;
  seq: number;
  eta: string;
  name: string;
  phone: string;
  address_line: string;
  city: string;
  zip: string;
  book_count: number;
  notes: string | null;
  status: PickupStatus;
  lat: number;
  lng: number;
  start_time: string;
  end_time: string;
};

type DriverDepot = { name: string; address: string; lat: number; lng: number } | null;

export type DriverRoute = {
  id: string;
  vehicle_name: string;
  color: string;
  start_at: string;
  end_at: string;
  total_seconds: number;
  total_books: number;
  start_depot: DriverDepot;
  end_depot: DriverDepot;
  stops: DriverStop[];
};

/** Driver SQL functions; `rpc` must run as the signed-in driver. */
export function createDriverApi(rpc: Rpc) {
  return {
    routes: async (date: string) => (await rpc("driver_routes", { p_date: date })) as DriverRoute[],
    setStopStatus: async (stopId: string, pickedUp: boolean) =>
      (await rpc("driver_set_stop_status", { p_stop_id: stopId, p_picked_up: pickedUp })) as {
        ok: true;
        status: PickupStatus;
      },
  };
}
