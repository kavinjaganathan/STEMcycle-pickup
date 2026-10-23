"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";

export function AccountForm({ passwordsEnabled }: { passwordsEnabled: boolean }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (!passwordsEnabled)
    return (
      <p className="mt-4 text-sm text-muted">Passwords aren&apos;t used in local development.</p>
    );

  async function change(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/auth/password", { method: "POST", body: { password } });
      setPassword("");
      setMsg({ kind: "success", text: "Password changed." });
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <Card className="mt-4">
      <form onSubmit={change} className="space-y-3">
        <h2 className="font-semibold">Change password</h2>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Field label="New password" hint="At least 10 characters.">
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
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
  );
}
