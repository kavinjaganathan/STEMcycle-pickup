/**
 * The app can live under a sub-path, e.g. https://ftcoverdrive.org/STEM, set by
 * NEXT_PUBLIC_BASE_PATH at build time. next/link, the router and redirect()
 * add it automatically; raw fetch() calls and plain URLs go through withBase().
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export function withBase(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}
