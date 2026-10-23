import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { Spinner } from "@/components/ui";

export default function DriverPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RoleGate role="driver">
        {(user) => (
          <AppShell
            nav={[{ href: "/driver", label: "My route" }]}
            userName={user.full_name || user.email}
          >
            <p>Your routes will appear here.</p>
          </AppShell>
        )}
      </RoleGate>
    </Suspense>
  );
}
