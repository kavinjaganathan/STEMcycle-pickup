import { submitContact } from "@/lib/contact-service";
import { getDeps, readJson } from "@/lib/deps";
import { log } from "@/lib/logger";
import { clientIp } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const { status, body } = await submitContact(
      await getDeps(),
      await readJson(request),
      clientIp(request.headers),
    );
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log("error", "contact_failed", { err });
    return Response.json(
      { ok: false, error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }
}
