import { pickupQuerySchema } from "@/lib/admin-schemas";
import { withAdmin } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { createAdminApi } from "@/lib/db/admin";
import { formatHourRange, TEXTBOOK_LABEL } from "@/lib/format";

export const GET = withAdmin(async ({ rpc }, request) => {
  const q = pickupQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const pickups = await createAdminApi(rpc).listPickups(q.from, q.to, q.status);
  const csv = toCsv(
    [
      "Date",
      "Time",
      "Status",
      "Driver",
      "Routing issue",
      "Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "ZIP",
      "Textbook type",
      "Books",
      "Boxes (est.)",
      "Notes",
      "Location",
      "Requested at",
      "ID",
    ],
    pickups.map((p) => [
      p.slot_date,
      formatHourRange(p.slot_hour),
      p.status,
      p.driver_name,
      p.route_issue,
      p.name,
      p.email,
      p.phone,
      p.address_line,
      p.city,
      p.zip,
      TEXTBOOK_LABEL[p.textbook_type],
      p.book_count,
      p.est_boxes,
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
