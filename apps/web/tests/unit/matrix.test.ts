import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMatrix, fakeMatrix, orsMatrix } from "@/lib/routing/matrix";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const pts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ lat: 33 + i / 1000, lng: -96.8 }));

describe("orsMatrix", () => {
  it("splits large matrices into requests under the free-tier cell limit, via POST", async () => {
    const calls: { url: string; body: { sources: number[]; locations: unknown[] } }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      const row = Array.from({ length: body.locations.length }, (_, j) => j * 10);
      return Response.json({
        durations: body.sources.map(() => row),
        distances: body.sources.map(() => row.map((x: number) => x * 5)),
      });
    });
    const m = await orsMatrix(pts(100), "key");
    expect(calls).toHaveLength(3); // 35 + 35 + 30 rows
    expect(calls.every((c) => c.body.sources.length * 100 <= 3500)).toBe(true);
    expect(calls.every((c) => !c.url.includes("33."))).toBe(true); // no coordinates in URLs
    expect(m.durations).toHaveLength(100);
    expect(m.durations[99][3]).toBe(30);
    expect(m.provider).toBe("ors");
  });

  it("treats unroutable pairs as very far", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        durations: [
          [0, null],
          [null, 0],
        ],
        distances: [
          [0, null],
          [null, 0],
        ],
      }),
    );
    const m = await orsMatrix(pts(2), "key");
    expect(m.durations[0][1]).toBe(36000);
  });
});

describe("buildMatrix", () => {
  it("falls back from ORS to OSRM, and errors rather than using straight lines", async () => {
    vi.stubEnv("ORS_API_KEY", "key");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouteservice")) return new Response("down", { status: 503 });
      return Response.json({
        code: "Ok",
        durations: [
          [0, 5],
          [5, 0],
        ],
        distances: [
          [0, 50],
          [50, 0],
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await buildMatrix(pts(2))).provider).toBe("osrm");

    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    await expect(buildMatrix(pts(2))).rejects.toThrow(/road travel times/);
  });

  it("fake matrix is symmetric with zero diagonal", () => {
    const m = fakeMatrix(pts(3));
    expect(m.durations[0][0]).toBe(0);
    expect(m.durations[0][2]).toBe(m.durations[2][0]);
  });
});
