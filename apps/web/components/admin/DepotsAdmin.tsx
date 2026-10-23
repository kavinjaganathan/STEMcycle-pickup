"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { Depot } from "@/lib/db/admin";
import { useLoad } from "./useLoad";

type Draft = Omit<Depot, "id"> & { id?: string };
const BLANK: Draft = { name: "", address: "", lat: null, lng: null, is_default: false };

export function DepotsAdmin() {
  const {
    data: depots,
    error,
    setError,
    reload,
  } = useLoad("/api/admin/depots", (b: { depots: Depot[] }) => b.depots);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [locating, setLocating] = useState(false);

  async function locate() {
    if (!draft?.address) return;
    setLocating(true);
    try {
      const r = await api<{ lat: number; lng: number }>("/api/admin/geocode", {
        method: "POST",
        body: { address: draft.address },
      });
      setDraft({ ...draft, lat: r.lat, lng: r.lng });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLocating(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    try {
      const { id, ...body } = draft;
      await api(id ? `/api/admin/depots/${id}` : "/api/admin/depots", {
        method: id ? "PATCH" : "POST",
        body,
      });
      setDraft(null);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(d: Depot) {
    try {
      await api(`/api/admin/depots/${d.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <>
      <PageHeader title="Depots">
        <Button
          variant="primary"
          onClick={() => setDraft({ ...BLANK, is_default: (depots?.length ?? 0) === 0 })}
        >
          Add depot
        </Button>
      </PageHeader>
      <p className="mb-4 text-sm text-muted">
        Where routes start and end, e.g. a storage unit or a volunteer&apos;s garage.
      </p>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {draft && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">{draft.id ? "Edit depot" : "New depot"}</h2>
          <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Field label="Address">
              {(id) => (
                <input
                  id={id}
                  required
                  value={draft.address}
                  onChange={(e) =>
                    setDraft({ ...draft, address: e.target.value, lat: null, lng: null })
                  }
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Latitude">
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  value={draft.lat ?? ""}
                  onChange={(e) => setDraft({ ...draft, lat: num(e.target.value) })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Longitude">
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  value={draft.lng ?? ""}
                  onChange={(e) => setDraft({ ...draft, lng: num(e.target.value) })}
                  className={inputClass}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button onClick={locate} disabled={locating || !draft.address}>
                {locating ? "Finding…" : "Find coordinates from address"}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={draft.is_default}
                  onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })}
                />
                Default depot
              </label>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary">
                Save
              </Button>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {depots === null ? (
        <Spinner />
      ) : depots.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No depots yet. Add one before planning routes.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {depots.map((d) => (
            <li key={d.id}>
              <Card>
                <h2 className="font-semibold">
                  {d.name}
                  {d.is_default && (
                    <span className="ml-2 text-xs font-normal text-muted">Default</span>
                  )}
                </h2>
                <p className="text-sm">{d.address}</p>
                <p className="text-sm text-muted">
                  {d.lat !== null && d.lng !== null
                    ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`
                    : "No coordinates yet: routes can't start here"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => setDraft(d)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(d)}>
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
