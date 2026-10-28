import type { GeocodeStatus, PickupStatus, TextbookType } from "@/lib/shared";
import type { Rpc } from "./repo";

export type { GeocodeStatus, PickupStatus } from "@/lib/shared";
export { PICKUP_STATUSES } from "@/lib/shared";

export type AdminPickup = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  zip: string;
  textbook_type: TextbookType;
  book_count: number;
  est_boxes: number;
  notes: string | null;
  slot_date: string;
  slot_hour: number;
  status: PickupStatus;
  geocode_status: GeocodeStatus;
  lat: number | null;
  lng: number | null;
  created_at: string;
  picked_up_at: string | null;
  cancelled_at: string | null;
  route_issue: string | null;
  pinned_driver_id: string | null;
  pinned_driver_name: string | null;
  driver_name: string | null;
};

export type DriverStatus = "pending" | "active" | "disabled";

export type AdminDriver = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  capacity_boxes: number;
  status: DriverStatus;
  created_at: string;
  availability: { date: string; hours: number[] }[];
};

export type OrgSettings = {
  org_name: string;
  timezone: string;
  zip_allowlist: string[];
  email_display_name: string;
  reply_to: string | null;
  retention_days: number;
  booking_weekends: number;
  sat_hours: number[];
  sun_hours: number[];
  slot_limit: number;
  lock_time: string;
  books_per_box: number;
  service_min_base: number;
  service_min_per_50_books: number;
  max_route_min: number;
  return_buffer_min: number;
  depot_name: string;
  depot_address: string;
  depot_lat: number | null;
  depot_lng: number | null;
};

/** Admin SQL functions. `rpc` is the service role, used only after the admin session check. */
export function createAdminApi(rpc: Rpc) {
  return {
    listPickups: async (from: string, to: string, statuses: PickupStatus[] | null) =>
      (await rpc("admin_list_pickups", {
        p_from: from,
        p_to: to,
        p_statuses: statuses && statuses.length ? statuses : null,
      })) as AdminPickup[],
    setPickupStatus: async (id: string, status: PickupStatus) =>
      (await rpc("admin_set_pickup_status", { p_id: id, p_status: status })) as {
        slot_date: string;
      },
    pinPickup: async (id: string, driverId: string | null) =>
      (await rpc("admin_pin_pickup", { p_id: id, p_driver_id: driverId })) as {
        slot_date: string;
      },
    setPickupLocation: (id: string, lat: number, lng: number) =>
      rpc("admin_set_pickup_location", { p_id: id, p_lat: lat, p_lng: lng }),
    updatePickupAddress: (id: string, a: { address_line: string; city: string; zip: string }) =>
      rpc("admin_update_pickup_address", {
        p_id: id,
        p_address_line: a.address_line,
        p_city: a.city,
        p_zip: a.zip,
      }),

    listDrivers: async () => (await rpc("admin_list_drivers")) as AdminDriver[],
    updateDriver: async (id: string, status: DriverStatus, capacity: number) =>
      (await rpc("admin_update_driver", {
        p_id: id,
        p_status: status,
        p_capacity: capacity,
      })) as { previous_status: DriverStatus; email: string; full_name: string },

    getSettings: async () => (await rpc("admin_get_settings")) as OrgSettings,
    updateSettings: (s: OrgSettings) => rpc("admin_update_settings", { p: s }),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
