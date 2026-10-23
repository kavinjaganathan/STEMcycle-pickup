"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  label?: string; // short text inside the pin, e.g. a stop number
  color?: string;
  shape?: "pin" | "square";
  draggable?: boolean;
};

export type MapLine = { id: string; points: [number, number][]; color: string };

type Props = {
  markers: MapMarker[];
  lines?: MapLine[];
  center?: { lat: number; lng: number };
  zoom?: number;
  /** Change this value to re-fit the view to the markers. */
  fitKey?: string | number;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  label: string;
  className?: string;
};

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type MapState = { Lf: typeof L; map: L.Map; group: L.LayerGroup; fitted: unknown };
type Handlers = Pick<Props, "onMarkerDragEnd" | "onMapClick">;
const NOT_FITTED = Symbol("not fitted");

function drawLayers(
  st: MapState,
  data: { markers: MapMarker[]; lines: MapLine[]; fitKey: unknown },
  handlers: { current: Handlers },
) {
  const { Lf, map, group } = st;
  group.clearLayers();

  for (const line of data.lines) {
    Lf.polyline(line.points, { color: line.color, weight: 4, opacity: 0.8 }).addTo(group);
  }
  for (const mk of data.markers) {
    const color = mk.color ?? "#1f6f4a";
    const square = mk.shape === "square";
    const icon = Lf.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: square ? [14, 14] : [14, 28],
      html: `<div style="width:28px;height:28px;background:${color};border:2px solid #fff;border-radius:${square ? "4px" : "50% 50% 50% 0"};${square ? "" : "transform:rotate(-45deg);"}box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="${square ? "" : "transform:rotate(45deg);"}color:#fff;font:600 12px system-ui">${escape(mk.label ?? "")}</span></div>`,
    });
    const marker = Lf.marker([mk.lat, mk.lng], {
      icon,
      title: mk.title,
      alt: mk.title,
      draggable: mk.draggable,
      keyboard: true,
    });
    if (mk.draggable) {
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        handlers.current.onMarkerDragEnd?.(mk.id, p.lat, p.lng);
      });
    }
    marker.bindTooltip(escape(mk.title));
    marker.addTo(group);
  }

  if (st.fitted !== data.fitKey) {
    st.fitted = data.fitKey;
    const pts: [number, number][] = [
      ...data.markers.map((x) => [x.lat, x.lng] as [number, number]),
      ...data.lines.flatMap((l) => l.points),
    ];
    if (pts.length > 1) map.fitBounds(Lf.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 16);
  }
}

/** OpenStreetMap + Leaflet. Purely visual: every map has a text equivalent nearby. */
export function LeafletMap({
  markers,
  lines = EMPTY,
  center,
  zoom = 11,
  fitKey,
  onMarkerDragEnd,
  onMapClick,
  label,
  className = "h-80",
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);
  const handlers = useRef<Handlers>({ onMarkerDragEnd, onMapClick });
  const latest = useRef({ markers, lines, fitKey });

  useEffect(() => {
    handlers.current = { onMarkerDragEnd, onMapClick };
  }, [onMarkerDragEnd, onMapClick]);

  // Create the map once (Leaflet needs the browser, so it is loaded lazily).
  const initial = useRef({ center, zoom });
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      if (cancelled || !el.current || state.current) return;
      const Lf = (mod.default ?? mod) as typeof L;
      const { center: c, zoom: z } = initial.current;
      const map = Lf.map(el.current, { scrollWheelZoom: false }).setView(
        [c?.lat ?? 33.1, c?.lng ?? -96.75],
        z,
      );
      Lf.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) =>
        handlers.current.onMapClick?.(e.latlng.lat, e.latlng.lng),
      );
      state.current = { Lf, map, group: Lf.layerGroup().addTo(map), fitted: NOT_FITTED };
      drawLayers(state.current, latest.current, handlers);
    });
    return () => {
      cancelled = true;
      state.current?.map.remove();
      state.current = null;
    };
  }, []);

  // Redraw markers/lines whenever they change.
  useEffect(() => {
    latest.current = { markers, lines, fitKey };
    if (state.current) drawLayers(state.current, latest.current, handlers);
  }, [markers, lines, fitKey]);

  return (
    <div
      ref={el}
      role="region"
      aria-label={label}
      className={`z-0 w-full overflow-hidden rounded-lg border border-border ${className}`}
    />
  );
}

const EMPTY: MapLine[] = [];
