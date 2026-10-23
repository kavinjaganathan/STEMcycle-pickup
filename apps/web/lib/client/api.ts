"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** JSON fetch for the app's own API; throws ApiError with a user-facing message. */
export async function api<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    issues?: Record<string, string[]>;
  };
  // Session expired: a full navigation clears any personal data held in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && typeof window !== "undefined") window.location.assign("/login");
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status, data.issues);
  return data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const first = err.issues && Object.entries(err.issues).find(([, v]) => v?.length);
    return first ? `${err.message} (${first[0].replace(/_/g, " ")}: ${first[1][0]})` : err.message;
  }
  return "Something went wrong.";
}
