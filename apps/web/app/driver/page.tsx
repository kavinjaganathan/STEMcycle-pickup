import type { Metadata } from "next";
import { DriverRoutes } from "@/components/driver/DriverRoutes";
import { InactiveNotice } from "@/components/InactiveNotice";
import { weekendParam } from "@/lib/admin-schemas";
import { requireDriver } from "@/lib/auth/guards";
import { getRepo } from "@/lib/db";
import { currentWeekend, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "My route" };

export default async function DriverHome(props: PageProps<"/driver">) {
  const { driver } = await requireDriver();
  if (driver.status !== "active") return <InactiveNotice status={driver.status} />;
  const { timezone } = await (await getRepo()).getPublicSettings();
  const today = todayIn(timezone);
  // Emails link to /driver?weekend=YYYY-MM-DD (a Saturday).
  const asked = weekendParam.safeParse((await props.searchParams).weekend);
  return (
    <DriverRoutes
      initialWeekend={asked.success ? asked.data : currentWeekend(today)}
      today={today}
      timezone={timezone}
    />
  );
}
