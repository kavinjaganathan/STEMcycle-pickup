import { pickupQuerySchema } from "@/lib/admin-schemas";
import { withAuth } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { createAdminApi } from "@/lib/db/admin";
import { formatWindow } from "@/lib/format";

export const GET = withAuth("admin", async ({ rpc }, request) => {
  const q = pickupQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const pickups = await createAdminApi(rpc).listPickups(q.from, q.to, q.status);
  const csv = toCsv(
    [
      "Date",
      "Window",
      "Status",
      "Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "ZIP",
      "Books",
      "Notes",
      "Location",
      "Requested at",
      "ID",
    ],
    pickups.map((p) => [
      p.slot_date,
      formatWindow(p),
      p.status,
      p.name,
      p.email,
      p.phone,
      p.address_line,
      p.city,
      p.zip,
      p.book_count,
      p.notes,
      p.geocode_status,
      p.created_at,
      p.id,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pickups-${q.from}-to-${q.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
