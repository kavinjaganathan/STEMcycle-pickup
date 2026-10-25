import { z } from "zod";
import { json, parseBody, withAdmin } from "@/lib/api";
import { searchPlace } from "@/lib/geocode-server";

// Address lookup for the depot. The address travels in the POST body, not the URL.
export const POST = withAdmin(async (_ctx, request) => {
  const { address } = await parseBody(
    request,
    z.object({ address: z.string().trim().min(5).max(200) }),
  );
  const hit = await searchPlace(address);
  if (!hit)
    return json({ error: "Couldn't find that address. Enter the coordinates by hand." }, 404);
  return json(hit);
});
