import { getDeps, readJson } from "@/lib/deps";
import { log } from "@/lib/logger";
import { handleCancel } from "@/lib/pickups/service";
import { clientIp } from "@/lib/security";

// The token travels in the POST body (never a query string) so it stays out of logs.
export async function POST(request: Request) {
  try {
    const deps = await getDeps();
    const { status, body } = await handleCancel(
      deps,
      await readJson(request),
      clientIp(request.headers),
    );
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log("error", "cancel_failed", { err });
    return Response.json(
      { ok: false, error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }
}
