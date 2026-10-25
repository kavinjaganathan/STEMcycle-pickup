import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireDriver } from "@/lib/auth/guards";
import { AccountForms } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };

const STATUS_TEXT = {
  pending: "Waiting for admin approval",
  active: "Active",
  disabled: "Turned off by an admin",
};

export default async function AccountPage(props: PageProps<"/driver/account">) {
  const { driver } = await requireDriver();
  const reset = (await props.searchParams).reset === "1";
  return (
    <>
      <PageHeader eyebrow="Driver account" title="Account" />
      <dl className="mb-8 grid max-w-xl grid-cols-2 border-t border-ink pt-4">
        <div>
          <dt className="text-sm text-muted">Email</dt>
          <dd className="mt-1 font-bold break-all">{driver.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Status</dt>
          <dd className="mt-1 font-bold">{STATUS_TEXT[driver.status]}</dd>
        </div>
      </dl>
      <AccountForms
        profile={{
          full_name: driver.full_name,
          phone: driver.phone,
          capacity_boxes: driver.capacity_boxes,
        }}
        focusPassword={reset}
      />
    </>
  );
}
