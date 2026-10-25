import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/security";

afterEach(() => vi.unstubAllEnvs());

describe("clientIp behind the ftcoverdrive.org proxy", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("trusts the forwarded visitor IP only with the proxy secret", () => {
    vi.stubEnv("PROXY_SECRET", "proxy-secret-0123456789");
    const base = { "x-forwarded-for": "172.64.0.1", "x-stemcycle-client-ip": "203.0.113.7" };
    expect(clientIp(h({ ...base, "x-stemcycle-proxy-secret": "proxy-secret-0123456789" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(h({ ...base, "x-stemcycle-proxy-secret": "wrong-secret-0123456789" }))).toBe(
      "172.64.0.1",
    );
    expect(clientIp(h(base))).toBe("172.64.0.1");
  });

  it("ignores the header when no secret is configured", () => {
    expect(
      clientIp(
        h({
          "x-forwarded-for": "1.1.1.1",
          "x-stemcycle-client-ip": "9.9.9.9",
          "x-stemcycle-proxy-secret": "",
        }),
      ),
    ).toBe("1.1.1.1");
  });
});
