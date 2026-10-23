type Point = { lat: number; lng: number };

const ll = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function googleMapsUrl(dest: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${ll(dest)}&travelmode=driving`;
}

export function appleMapsUrl(dest: Point): string {
  return `https://maps.apple.com/?daddr=${ll(dest)}&dirflg=d`;
}

/** Google Maps directions through several stops (Google allows up to 9 waypoints). */
export function googleMultiStopUrl(stops: Point[]): string | null {
  if (stops.length === 0) return null;
  const route = stops.slice(0, 10);
  const dest = route[route.length - 1];
  const waypoints = route.slice(0, -1).map(ll).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${ll(dest)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
}
