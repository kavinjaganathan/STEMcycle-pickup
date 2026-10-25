"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";

export function DriverLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(
    params.get("error") === "link"
      ? { kind: "error", text: "That link has expired or was already used. Please try again." }
      : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        await api("/api/auth/login", { method: "POST", body: { email, password } });
        router.replace("/driver");
        return;
      }
      await api("/api/auth/reset", { method: "POST", body: { email } });
      setMsg({
        kind: "success",
        text: "If that email has a driver account, a reset link is on its way.",
      });
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
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
      {mode === "signin" && (
        <Field label="Password">
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {mode === "signin" ? "Sign in" : "Email me a reset link"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "reset" : "signin");
          setMsg(null);
        }}
        className="text-sm font-bold underline underline-offset-4"
      >
        {mode === "signin" ? "Forgot your password?" : "Back to sign in"}
      </button>
    </form>
  );
}

export function DevLogin({
  users,
}: {
  users: { id: string; full_name: string; status: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signIn(body: { userId: string } | { admin: true }) {
    try {
      await api("/api/auth/dev-login", { method: "POST", body });
      router.replace("admin" in body ? "/admin" : "/driver");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section aria-labelledby="dev-title" className="border-t border-line pt-6">
      <h2 id="dev-title" className="font-bold">
        Local development
      </h2>
      <p className="mt-1 text-sm text-muted">
        Sign in without a password. This is disabled when deployed.
      </p>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        <li>
          <Button className="w-full justify-between" onClick={() => signIn({ admin: true })}>
            <span>Sign in as Admin</span>
            <span className="text-xs font-semibold text-muted">admin</span>
          </Button>
        </li>
        {users.map((u) => (
          <li key={u.id}>
            <Button className="w-full justify-between" onClick={() => signIn({ userId: u.id })}>
              <span>Sign in as {u.full_name}</span>
              <span className="text-xs font-semibold text-muted">{u.status}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
