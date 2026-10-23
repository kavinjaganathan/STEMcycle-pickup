import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { DriverRoutes } from "@/components/driver/DriverRoutes";
import { RoleGate } from "@/components/RoleGate";
import { Spinner } from "@/components/ui";
import { getRepo } from "@/lib/db";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "My route" };

export default function DriverPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RoleGate role="driver">
        {(user) => (
          <AppShell
            nav={[{ href: "/driver", label: "My route" }]}
            userName={user.full_name || user.email}
          >
            <Suspense fallback={<Spinner />}>
              <DriverHome />
            </Suspense>
          </AppShell>
        )}
      </RoleGate>
    </Suspense>
  );
}

async function DriverHome() {
  const { timezone } = await (await getRepo()).getPublicSettings();
  return <DriverRoutes today={todayIn(timezone)} />;
}
