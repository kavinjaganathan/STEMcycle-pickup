"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { OrgSettings } from "@/lib/db/admin";
import { useLoad } from "./useLoad";

export function SettingsAdmin() {
  const { data, error, setError } = useLoad(
    "/api/admin/settings",
    (b: { settings: OrgSettings }) => b.settings,
  );
  if (error && !data) return <Notice kind="error">{error}</Notice>;
  if (!data) return <Spinner />;
  return <SettingsForm initial={data} onError={setError} error={error} />;
}

function SettingsForm({
  initial,
  error,
  onError,
}: {
  initial: OrgSettings;
  error: string | null;
  onError: (e: string | null) => void;
}) {
  const [s, setS] = useState({
    ...initial,
    default_start_time: initial.default_start_time.slice(0, 5),
    reply_to: initial.reply_to ?? "",
  });
  const [zips, setZips] = useState(initial.zip_allowlist.join(", "));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    onError(null);
    try {
      const zip_allowlist = [...new Set(zips.split(/[\s,]+/).filter(Boolean))];
      await api("/api/admin/settings", { method: "PUT", body: { ...s, zip_allowlist } });
      setSaved(true);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const num = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS({ ...s, [k]: Number(e.target.value) });

  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={save} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {saved && <Notice kind="success">Settings saved.</Notice>}
        <Card>
          <h2 className="mb-3 font-semibold">Organization &amp; email</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Organization name">
              {(id) => (
                <input
                  id={id}
                  required
                  value={s.org_name}
                  onChange={(e) => setS({ ...s, org_name: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Timezone" hint="IANA name, e.g. America/Chicago.">
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  required
                  value={s.timezone}
                  onChange={(e) => setS({ ...s, timezone: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Email sender name">
              {(id) => (
                <input
                  id={id}
                  required
                  value={s.email_display_name}
                  onChange={(e) => setS({ ...s, email_display_name: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field
              label="Reply-to address (optional)"
              hint="The sending address itself is set by EMAIL_FROM in the hosting settings."
            >
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="email"
                  value={s.reply_to}
                  onChange={(e) => setS({ ...s, reply_to: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Bookings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Service-area ZIP codes"
              hint="Separate with commas or spaces."
              className="sm:col-span-2"
            >
              {(id, d) => (
                <textarea
                  id={id}
                  aria-describedby={d}
                  rows={3}
                  value={zips}
                  onChange={(e) => setZips(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Booking cutoff (hours before a window)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  max={168}
                  value={s.booking_cutoff_hours}
                  onChange={num("booking_cutoff_hours")}
                  className={inputClass}
                />
              )}
            </Field>
            <Field
              label="Delete personal details after (days)"
              hint="Applies to completed or cancelled pickups."
            >
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="number"
                  min={7}
                  max={3650}
                  value={s.retention_days}
                  onChange={num("retention_days")}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Route planning</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Minutes per stop">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  max={60}
                  value={s.service_min_base}
                  onChange={num("service_min_base")}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Extra minutes per 50 books">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  max={30}
                  value={s.service_min_per_50_books}
                  onChange={num("service_min_per_50_books")}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Default route start time">
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={s.default_start_time}
                  onChange={(e) => setS({ ...s, default_start_time: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </Card>
        <Button type="submit" variant="primary" disabled={busy}>
          Save settings
        </Button>
      </form>
    </>
  );
}
