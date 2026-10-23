"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { TeamUser, Vehicle } from "@/lib/db/admin";
import { useLoad } from "./useLoad";

type Draft = Omit<Vehicle, "id"> & { id?: string };
const BLANK: Draft = {
  name: "",
  type: "SUV",
  capacity_books: 400,
  max_route_min: 240,
  default_driver_id: null,
  active: true,
};

export function VehiclesAdmin() {
  const {
    data: vehicles,
    error,
    setError,
    reload,
  } = useLoad("/api/admin/vehicles", (b: { vehicles: Vehicle[] }) => b.vehicles);
  const { data: users } = useLoad("/api/admin/users", (b: { users: TeamUser[] }) => b.users);
  const [draft, setDraft] = useState<Draft | null>(null);

  const drivers = (users ?? []).filter((u) => u.active);
  const driverName = (id: string | null) => drivers.find((u) => u.id === id)?.full_name ?? "—";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    try {
      const { id, ...body } = draft;
      await api(id ? `/api/admin/vehicles/${id}` : "/api/admin/vehicles", {
        method: id ? "PATCH" : "POST",
        body,
      });
      setDraft(null);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(v: Vehicle) {
    try {
      await api(`/api/admin/vehicles/${v.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Vehicles">
        <Button
          variant="primary"
          onClick={() => setDraft({ ...BLANK, name: `SUV ${(vehicles?.length ?? 0) + 1}` })}
        >
          Add vehicle
        </Button>
      </PageHeader>
      <p className="mb-4 text-sm text-muted">
        Capacity and max route time are used by the route planner. A typical SUV with the seats down
        holds about 20 boxes (≈400 books).
      </p>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {draft && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">{draft.id ? "Edit vehicle" : "New vehicle"}</h2>
          <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              {(id) => (
                <input
                  id={id}
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Type">
              {(id) => (
                <input
                  id={id}
                  required
                  list="vehicle-types"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <datalist id="vehicle-types">
              <option value="SUV" />
              <option value="Minivan" />
              <option value="Sedan" />
              <option value="Pickup truck" />
              <option value="Cargo van" />
            </datalist>
            <Field label="Capacity (books)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  required
                  min={1}
                  value={draft.capacity_books}
                  onChange={(e) => setDraft({ ...draft, capacity_books: Number(e.target.value) })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Max route time (minutes)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  required
                  min={30}
                  max={720}
                  value={draft.max_route_min}
                  onChange={(e) => setDraft({ ...draft, max_route_min: Number(e.target.value) })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Usual driver">
              {(id) => (
                <select
                  id={id}
                  value={draft.default_driver_id ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, default_driver_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">None</option>
                  {drivers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand)]"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Available for routes
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" variant="primary">
                Save
              </Button>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {vehicles === null ? (
        <Spinner />
      ) : vehicles.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No vehicles yet.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Card className={v.active ? "" : "opacity-60"}>
                <h2 className="font-semibold">
                  {v.name} <span className="text-sm font-normal text-muted">· {v.type}</span>
                </h2>
                <p className="text-sm">
                  {v.capacity_books} books · up to {v.max_route_min} min
                </p>
                <p className="text-sm text-muted">
                  Usual driver: {driverName(v.default_driver_id)}
                  {v.active ? "" : " · unavailable"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => setDraft(v)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(v)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
