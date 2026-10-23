"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";

export function SupabaseLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "link" ? "That sign-in link has expired. Request a new one." : null,
  );
  const [sent, setSent] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace("/admin");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email) return setError("Enter your email first.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/magic-link", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={signIn} className="space-y-4">
      {error && <Notice kind="error">{error}</Notice>}
      {sent && (
        <Notice kind="success">If that email has an account, a sign-in link is on its way.</Notice>
      )}
      <Field label="Email">
        {(id) => (
          <input
            id={id}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Password">
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={busy || !password}
      >
        Sign in
      </Button>
      <div className="text-center text-sm text-muted">or</div>
      <Button size="lg" className="w-full" onClick={magicLink} disabled={busy}>
        Email me a sign-in link
      </Button>
    </form>
  );
}

export function DevLogin({
  users,
}: {
  users: { id: string; email: string; role: string; full_name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signInAs(userId: string, role: string) {
    try {
      await api("/api/auth/dev-login", { method: "POST", body: { userId } });
      router.replace(role === "admin" ? "/admin" : "/driver");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-3">
      <Notice>
        Local development mode: pick a user to sign in as. This is disabled when deployed.
      </Notice>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <Button className="w-full justify-between" onClick={() => signInAs(u.id, u.role)}>
              <span>Sign in as {u.full_name || u.email}</span>
              <span className="text-xs font-normal text-muted">{u.role}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
