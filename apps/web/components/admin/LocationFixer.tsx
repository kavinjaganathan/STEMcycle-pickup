"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { AdminPickup } from "@/lib/db/admin";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse bg-tint" />,
});

const CENTER = { lat: 33.1, lng: -96.75 };
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

type GeoResult = {
  status: "ok" | "needs_review" | "failed" | "pending";
  lat?: number;
  lng?: number;
};

/** Dialog for correcting a pickup's address or dropping its pin by hand. */
export function LocationFixer({
  pickup,
  onClose,
  onSaved,
}: {
  pickup: AdminPickup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [addr, setAddr] = useState({
    address_line: pickup.address_line,
    city: pickup.city,
    zip: pickup.zip,
  });
  const [pin, setPin] = useState(
    pickup.lat !== null && pickup.lng !== null ? { lat: pickup.lat, lng: pickup.lng } : null,
  );
  const [fitKey, setFitKey] = useState(0);
  const [msg, setMsg] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(
    pickup.geocode_status === "failed"
      ? {
          kind: "info",
          text: "We couldn't find this address. Correct it below, or drop the pin on the map.",
        }
      : {
          kind: "info",
          text: "This location is approximate. Drag the pin to the right house, then save.",
        },
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  async function searchAgain(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<GeoResult>(`/api/admin/pickups/${pickup.id}/address`, {
        method: "PUT",
        body: addr,
      });
      if (r.lat !== undefined && r.lng !== undefined) {
        setPin({ lat: round6(r.lat), lng: round6(r.lng) });
        setFitKey((k) => k + 1);
      }
      setMsg(
        r.status === "ok"
          ? { kind: "success", text: "Address found. Check the pin, then save." }
          : r.status === "needs_review"
            ? {
                kind: "info",
                text: "Found an approximate location. Drag the pin to the right spot.",
              }
            : r.status === "failed"
              ? { kind: "error", text: "Still not found. Drop the pin on the map instead." }
              : { kind: "error", text: "The address service is busy. Try again in a minute." },
      );
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    if (!pin) return;
    setBusy(true);
    try {
      await api(`/api/admin/pickups/${pickup.id}/location`, { method: "PUT", body: pin });
      onSaved();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
      setBusy(false);
    }
  }

  const coord = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="fix-title"
      className="panel m-auto w-[min(100%-2rem,42rem)] p-0 text-ink backdrop:bg-black/50"
    >
      <div className="max-h-[90vh] space-y-4 overflow-y-auto p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="fix-title" className="text-xl font-extrabold tracking-tight">
            Fix location: {pickup.name}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
          >
            ✕
          </Button>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        <form
          onSubmit={searchAgain}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        >
          <Field label="Street">
            {(id) => (
              <input
                id={id}
                value={addr.address_line}
                onChange={(e) => setAddr({ ...addr, address_line: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="City">
            {(id) => (
              <input
                id={id}
                value={addr.city}
                onChange={(e) => setAddr({ ...addr, city: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="ZIP">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={addr.zip}
                onChange={(e) => setAddr({ ...addr, zip: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Button type="submit" disabled={busy}>
            Search again
          </Button>
        </form>

        <div>
          <p className="mb-2 text-sm text-muted">
            Click the map or drag the pin to set the exact pickup spot.
          </p>
          <LeafletMap
            label="Pickup location map"
            className="h-72"
            center={pin ?? CENTER}
            zoom={pin ? 16 : 11}
            fitKey={fitKey}
            markers={
              pin
                ? [
                    {
                      id: "pin",
                      ...pin,
                      title: "Pickup location",
                      draggable: true,
                      color: "#b42318",
                    },
                  ]
                : []
            }
            onMarkerDragEnd={(_id, lat, lng) => setPin({ lat: round6(lat), lng: round6(lng) })}
            onMapClick={(lat, lng) => setPin({ lat: round6(lat), lng: round6(lng) })}
          />
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-bold">Or type coordinates</legend>
          <Field label="Latitude">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={pin?.lat ?? ""}
                onChange={(e) => {
                  const v = coord(e.target.value);
                  setPin(v === null ? null : { lat: v, lng: pin?.lng ?? CENTER.lng });
                }}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Longitude">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={pin?.lng ?? ""}
                onChange={(e) => {
                  const v = coord(e.target.value);
                  setPin(v === null ? null : { lat: pin?.lat ?? CENTER.lat, lng: v });
                }}
                className={inputClass}
              />
            )}
          </Field>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button variant="primary" disabled={busy || !pin} onClick={savePin}>
            Save pin location
          </Button>
        </div>
      </div>
    </dialog>
  );
}
