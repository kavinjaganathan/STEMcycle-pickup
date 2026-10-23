import { getDeps, readJson } from "@/lib/deps";
import { log } from "@/lib/logger";
import { submitPickup } from "@/lib/pickups/service";
import { clientIp } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const deps = await getDeps();
    const { status, body } = await submitPickup(
      deps,
      await readJson(request),
      clientIp(request.headers),
    );
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log("error", "pickup_submit_failed", { err });
    return Response.json(
      { ok: false, error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }
}
