import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createGeocodeRepo, createRepo, pgRpc, type GeocodeRepo } from "@/lib/db/repo";
import {
  addressHash,
  geocodeAddress,
  geocodePending,
  nominatimGeocoder,
  normalizeAddress,
  type Geocoder,
} from "@/lib/geocode";

let db: PGlite;
let repo: GeocodeRepo;

beforeEach(async () => {
  db = await createLocalDb({ seed: true });
  repo = createGeocodeRepo(pgRpc(db));
});
afterEach(() => vi.unstubAllGlobals());

const addr = { street: "6100 Main St", city: "Frisco", zip: "75034" };

describe("normalizeAddress", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeAddress("6100  Main St.", "FRISCO", "75034-1234")).toBe(
      normalizeAddress("6100 main st", "frisco", "75034"),
    );
  });
});

describe("geocodeAddress", () => {
  it("uses the cache instead of the network for repeat addresses", async () => {
    const geocoder = vi.fn<Geocoder>(async () => ({ lat: 33.15, lng: -96.82, quality: "exact" }));
    expect(await geocodeAddress(repo, geocoder, addr)).toEqual({
      status: "ok",
      lat: 33.15,
      lng: -96.82,
    });
    expect(
      await geocodeAddress(repo, geocoder, { ...addr, street: "6100 MAIN ST." }),
    ).toMatchObject({ status: "ok" });
    expect(geocoder).toHaveBeenCalledTimes(1);
    // The cache key is a hash; the plain address is not stored.
    const { rows } = await db.query<{ address_hash: string }>(
      "select address_hash from geocode_cache",
    );
    expect(rows).toEqual([{ address_hash: addressHash(addr.street, addr.city, addr.zip) }]);
  });

  it("flags approximate or out-of-area matches for review", async () => {
    expect(
      await geocodeAddress(
        repo,
        async () => ({ lat: 33.1, lng: -96.8, quality: "approximate" }),
        addr,
      ),
    ).toMatchObject({ status: "needs_review" });
    expect(
      await geocodeAddress(repo, async () => ({ lat: 30.27, lng: -97.74, quality: "exact" }), {
        ...addr,
        street: "1 Elsewhere",
      }),
    ).toMatchObject({
      status: "needs_review",
    });
  });

  it("reports failure when nothing is found", async () => {
    expect(await geocodeAddress(repo, async () => null, addr)).toEqual({ status: "failed" });
  });
});

describe("nominatimGeocoder", () => {
  const throttle = vi.fn(async () => {});

  it("sends a structured, service-area-bounded query with a User-Agent", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json([
        { lat: "33.15", lon: "-96.82", address: { house_number: "6100", postcode: "75034" } },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await nominatimGeocoder(throttle)(addr)).toEqual({
      lat: 33.15,
      lng: -96.82,
      quality: "exact",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(params.get("bounded")).toBe("1");
    expect(params.get("postalcode")).toBe("75034");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^StemCyclePickup/);
    expect(throttle).toHaveBeenCalled();
  });

  it("treats a missing house number or a different ZIP as approximate", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json([{ lat: "33", lon: "-96.8", address: { postcode: "75034" } }]),
    );
    expect((await nominatimGeocoder(throttle)(addr))?.quality).toBe("approximate");
    vi.stubGlobal("fetch", async () =>
      Response.json([
        { lat: "33", lon: "-96.8", address: { house_number: "1", postcode: "75070" } },
      ]),
    );
    expect((await nominatimGeocoder(throttle)(addr))?.quality).toBe("approximate");
  });

  it("leaves pickups pending when the service is down", async () => {
    vi.stubGlobal("fetch", async () => new Response("busy", { status: 503 }));
    expect(await geocodeAddress(repo, nominatimGeocoder(throttle), addr)).toEqual({
      status: "pending",
    });
  });
});

describe("geocodePending", () => {
  it("geocodes waiting pickups and records the results", async () => {
    const r = createRepo(pgRpc(db));
    const [slot] = await r.listAvailableSlots(new Date());
    for (const [i, street] of ["1 Good St", "Nowhere Rd"].entries()) {
      await r.createPickup(
        {
          name: "A",
          email: "a@b.co",
          phone: "2145550100",
          address_line: street,
          city: "Frisco",
          zip: "75034",
          book_count: 5,
          notes: null,
          slot_id: slot.id,
        },
        `t${i}`,
        new Date(),
      );
    }
    const geocoder: Geocoder = async (a) =>
      a.street.startsWith("Nowhere") ? null : { lat: 33.15, lng: -96.82, quality: "exact" };
    expect(await geocodePending(repo, geocoder)).toEqual({ processed: 2, remaining: 0 });
    const { rows } = await db.query(
      "select address_line, geocode_status from pickups order by address_line",
    );
    expect(rows).toEqual([
      { address_line: "1 Good St", geocode_status: "ok" },
      { address_line: "Nowhere Rd", geocode_status: "failed" },
    ]);
  });
});

describe("geocode_reserve", () => {
  it("spaces requests at least the interval apart", async () => {
    const waits = [];
    for (let i = 0; i < 3; i++) waits.push(await repo.reserve(1000));
    expect(waits[0]).toBeLessThanOrEqual(5);
    expect(waits[1]).toBeGreaterThan(900);
    expect(waits[2]).toBeGreaterThan(1900);
  });
});
