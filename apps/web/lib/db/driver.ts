import type { Rpc } from "./repo";

export type AvailabilityDay = { date: string; lock_at: string; hours: number[] };
export type Availability = {
  timezone: string;
  first_hour: number;
  last_hour: number;
  days: AvailabilityDay[];
};

/** Driver SQL functions; `rpc` must run as the signed-in driver. */
export function createDriverApi(rpc: Rpc) {
  return {
    availability: async () => (await rpc("driver_get_availability")) as Availability,
    setAvailability: (date: string, hours: number[]) =>
      rpc("driver_set_availability", { p_date: date, p_hours: hours }),
  };
}
