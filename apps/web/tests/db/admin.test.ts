import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createAdminApi } from "@/lib/db/admin";
import { createRepo, pgRpc, RpcError } from "@/lib/db/repo";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const DRIVER = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
const asAdmin = () => createAdminApi(pgRpc(db, { asUser: ADMIN }));
const asDriver = () => createAdminApi(pgRpc(db, { asUser: DRIVER }));

beforeEach(async () => {
  db = await createLocalDb({ seed: true });
});

async function bookOne() {
  const repo = createRepo(pgRpc(db));
  const [slot] = await repo.listAvailableSlots(new Date());
  const res = await repo.createPickup(
    {
      name: "Ada",
      email: "a@b.co",
      phone: "2145550100",
      address_line: "1 Main St",
      city: "Frisco",
      zip: "75033",
      book_count: 10,
      notes: null,
      slot_id: slot.id,
    },
    "tok",
    new Date(),
  );
  if (res.result !== "ok") throw new Error(res.result);
  return { slot, pickupId: res.pickup_id };
}

describe("admin functions", () => {
  it("are refused for drivers", async () => {
    const err = await asDriver()
      .listVehicles()
      .catch((e) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).forbidden).toBe(true);
    await expect(asDriver().getSettings()).rejects.toThrow();
    await expect(asDriver().listUsers()).rejects.toThrow();
  });

  it("are refused for inactive admins", async () => {
    await db.query("update profiles set active = false where id = $1", [ADMIN]);
    await expect(asAdmin().listVehicles()).rejects.toThrow();
  });

  it("list and update pickups", async () => {
    const { slot, pickupId } = await bookOne();
    const api = asAdmin();
    const list = await api.listPickups(slot.slot_date, slot.slot_date, ["pending"]);
    expect(list.map((p) => p.id)).toEqual([pickupId]);
    await api.setPickupStatus(pickupId, "picked_up");
    expect(await api.listPickups(slot.slot_date, slot.slot_date, ["pending"])).toEqual([]);
    const [p] = await api.listPickups(slot.slot_date, slot.slot_date, null);
    expect(p.status).toBe("picked_up");
    expect(p.picked_up_at).not.toBeNull();
    const { rows } = await db.query(
      "select actor_id, action from audit_log where entity_id = $1 order by id",
      [pickupId],
    );
    expect(rows.at(-1)).toEqual({ actor_id: ADMIN, action: "set_status_picked_up" });
  });

  it("creates slots without duplicates and refuses to delete booked slots", async () => {
    const api = asAdmin();
    expect(
      (await api.createSlots(["2030-01-05", "2030-01-12"], "09:00", "12:00", 10)).created,
    ).toBe(2);
    expect((await api.createSlots(["2030-01-05"], "09:00", "12:00", 10)).created).toBe(0);
    const { slot } = await bookOne();
    await expect(api.deleteSlot(slot.id)).rejects.toThrow("slot_has_pickups");
  });

  it("keeps exactly one default depot", async () => {
    const api = asAdmin();
    await api.saveDepot({ name: "B", address: "x", lat: 33, lng: -96.8, is_default: true });
    const depots = await api.listDepots();
    expect(depots.filter((d) => d.is_default)).toHaveLength(1);
    expect(depots.find((d) => d.is_default)?.name).toBe("B");
  });

  it("saves vehicles", async () => {
    const api = asAdmin();
    const { id } = await api.saveVehicle({
      name: "Van",
      type: "Minivan",
      capacity_books: 300,
      max_route_min: 180,
      default_driver_id: DRIVER,
      active: true,
    });
    const v = (await api.listVehicles()).find((x) => x.id === id);
    expect(v).toMatchObject({ capacity_books: 300, default_driver_id: DRIVER });
  });

  it("prevents admins from demoting themselves", async () => {
    await expect(
      asAdmin().updateUser(ADMIN, { role: "driver", full_name: "A", phone: "", active: true }),
    ).rejects.toThrow("cannot_demote_self");
  });

  it("updates settings", async () => {
    const api = asAdmin();
    const s = await api.getSettings();
    await api.updateSettings({ ...s, zip_allowlist: ["75033"], booking_cutoff_hours: 24 });
    expect((await api.getSettings()).zip_allowlist).toEqual(["75033"]);
  });

  it("creates a driver profile when an auth user is added", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ('new@x.org') returning id",
    );
    const users = await asAdmin().listUsers();
    expect(users.find((u) => u.id === rows[0].id)).toMatchObject({
      role: "driver",
      email: "new@x.org",
    });
  });
});
