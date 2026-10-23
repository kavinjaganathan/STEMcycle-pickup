import { connection } from "next/server";
import { getRepo } from "@/lib/db";

// For uptime monitors. Says only whether the app can reach its database.
export async function GET() {
  await connection();
  try {
    const ok = await (await getRepo()).healthCheck();
    return Response.json(
      { status: ok ? "ok" : "degraded" },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
