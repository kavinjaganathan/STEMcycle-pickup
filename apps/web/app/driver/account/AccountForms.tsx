"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import { formatPhone } from "@/lib/validation";

type Profile = { full_name: string; phone: string; capacity_boxes: number };
type Msg = { kind: "success" | "error"; text: string } | null;

export function AccountForms({
  profile,
  focusPassword,
}: {
  profile: Profile;
  focusPassword: boolean;
}) {
  const [p, setP] = useState({
    ...profile,
    phone: profile.phone.length === 10 ? formatPhone(profile.phone) : profile.phone,
    capacity_boxes: String(profile.capacity_boxes),
  });
  const [password, setPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [pwMsg, setPwMsg] = useState<Msg>(
    focusPassword ? { kind: "success", text: "You're signed in. Choose a new password." } : null,
  );

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/driver/profile", { method: "PATCH", body: p });
      setProfileMsg({ kind: "success", text: "Saved." });
    } catch (err) {
      setProfileMsg({ kind: "error", text: errorText(err) });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/auth/password", { method: "POST", body: { password } });
      setPassword("");
      setPwMsg({ kind: "success", text: "Password changed." });
    } catch (err) {
      setPwMsg({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <Card>
        <form onSubmit={saveProfile} className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight">Your details</h2>
          {profileMsg && <Notice kind={profileMsg.kind}>{profileMsg.text}</Notice>}
          <Field label="Full name">
            {(id) => (
              <input
                id={id}
                autoComplete="name"
                value={p.full_name}
                onChange={(e) => setP({ ...p, full_name: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Phone">
            {(id) => (
              <input
                id={id}
                type="tel"
                autoComplete="tel"
                value={p.phone}
                onChange={(e) => setP({ ...p, phone: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field
            label="Vehicle capacity (boxes)"
            hint="Changing this re-plans your upcoming routes."
          >
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={p.capacity_boxes}
                onChange={(e) => setP({ ...p, capacity_boxes: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Button type="submit" variant="primary">
            Save details
          </Button>
        </form>
      </Card>
      <Card>
        <form onSubmit={changePassword} className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight">Change password</h2>
          {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
          <Field label="New password" hint="At least 10 characters.">
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                autoFocus={focusPassword}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Button type="submit" variant="primary">
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
