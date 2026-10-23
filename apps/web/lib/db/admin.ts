import type { Rpc, SlotWindow } from "./repo";

export type PickupStatus = "pending" | "scheduled" | "picked_up" | "cancelled";
export type GeocodeStatus = "pending" | "ok" | "needs_review" | "failed";
export const PICKUP_STATUSES: PickupStatus[] = ["pending", "scheduled", "picked_up", "cancelled"];

export type AdminPickup = SlotWindow & {
  id: string;
  name: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  zip: string;
  book_count: number;
  notes: string | null;
  status: PickupStatus;
  geocode_status: GeocodeStatus;
  lat: number | null;
  lng: number | null;
  created_at: string;
  picked_up_at: string | null;
  cancelled_at: string | null;
  slot_id: string;
};

export type AdminSlot = SlotWindow & {
  id: string;
  capacity: number | null;
  active: boolean;
  booked: number;
};

export type Vehicle = {
  id: string;
  name: string;
  type: string;
  capacity_books: number;
  max_route_min: number;
  default_driver_id: string | null;
  active: boolean;
};

export type Depot = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
};

export type TeamUser = {
  id: string;
  email: string;
  role: "admin" | "driver";
  full_name: string;
  phone: string | null;
  active: boolean;
};

export type OrgSettings = {
  org_name: string;
  timezone: string;
  zip_allowlist: string[];
  booking_cutoff_hours: number;
  email_display_name: string;
  reply_to: string | null;
  retention_days: number;
  service_min_base: number;
  service_min_per_50_books: number;
  default_start_time: string;
};

/** Typed wrappers for the admin SQL functions; `rpc` must run as the signed-in user. */
export function createAdminApi(rpc: Rpc) {
  return {
    listPickups: async (from: string, to: string, statuses: PickupStatus[] | null) =>
      (await rpc("admin_list_pickups", {
        p_from: from,
        p_to: to,
        p_statuses: statuses && statuses.length ? statuses : null,
      })) as AdminPickup[],
    setPickupStatus: (id: string, status: PickupStatus) =>
      rpc("admin_set_pickup_status", { p_id: id, p_status: status }),

    setPickupLocation: (id: string, lat: number, lng: number) =>
      rpc("admin_set_pickup_location", { p_id: id, p_lat: lat, p_lng: lng }),
    updatePickupAddress: (id: string, a: { address_line: string; city: string; zip: string }) =>
      rpc("admin_update_pickup_address", {
        p_id: id,
        p_address_line: a.address_line,
        p_city: a.city,
        p_zip: a.zip,
      }),

    listSlots: async (from: string) =>
      (await rpc("admin_list_slots", { p_from: from })) as AdminSlot[],
    createSlots: async (dates: string[], start: string, end: string, capacity: number | null) =>
      (await rpc("admin_create_slots", {
        p_dates: dates,
        p_start: start,
        p_end: end,
        p_capacity: capacity,
      })) as { created: number },
    updateSlot: (id: string, capacity: number | null, active: boolean) =>
      rpc("admin_update_slot", { p_id: id, p_capacity: capacity, p_active: active }),
    deleteSlot: (id: string) => rpc("admin_delete_slot", { p_id: id }),

    listVehicles: async () => (await rpc("admin_list_vehicles")) as Vehicle[],
    saveVehicle: async (v: Omit<Vehicle, "id"> & { id?: string }) =>
      (await rpc("admin_save_vehicle", { p: v })) as { id: string },
    deleteVehicle: (id: string) => rpc("admin_delete_vehicle", { p_id: id }),

    listDepots: async () => (await rpc("admin_list_depots")) as Depot[],
    saveDepot: async (d: Omit<Depot, "id"> & { id?: string }) =>
      (await rpc("admin_save_depot", { p: d })) as { id: string },
    deleteDepot: (id: string) => rpc("admin_delete_depot", { p_id: id }),

    listUsers: async () => (await rpc("admin_list_users")) as TeamUser[],
    updateUser: (id: string, u: Omit<TeamUser, "id" | "email">) =>
      rpc("admin_update_user", {
        p_id: id,
        p_role: u.role,
        p_full_name: u.full_name,
        p_phone: u.phone ?? "",
        p_active: u.active,
      }),

    getSettings: async () => (await rpc("admin_get_settings")) as OrgSettings,
    updateSettings: (s: OrgSettings) => rpc("admin_update_settings", { p: s }),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
