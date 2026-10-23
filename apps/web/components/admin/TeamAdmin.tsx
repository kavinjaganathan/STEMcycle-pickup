"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { TeamUser } from "@/lib/db/admin";
import { useLoad } from "./useLoad";

export function TeamAdmin() {
  const {
    data: users,
    error,
    setError,
    reload,
  } = useLoad("/api/admin/users", (b: { users: TeamUser[] }) => b.users);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    role: "driver" as TeamUser["role"],
  });
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(
    null,
  );
  const [editing, setEditing] = useState<TeamUser | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ tempPassword: string | null }>("/api/admin/users", {
        method: "POST",
        body: form,
      });
      setCreated({ email: form.email, tempPassword: res.tempPassword });
      setForm({ email: "", full_name: "", phone: "", role: "driver" });
      setAdding(false);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const { id, email: _email, ...body } = editing;
      void _email;
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: { ...body, phone: body.phone ?? "" },
      });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Team">
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add person
        </Button>
      </PageHeader>
      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {created && (
        <div className="mb-4">
          <Notice kind="success">
            <p>
              Account created for <strong>{created.email}</strong>.
            </p>
            {created.tempPassword ? (
              <p className="mt-1">
                Temporary password (shown only once):{" "}
                <code className="select-all rounded bg-surface px-1.5 py-0.5 font-mono">
                  {created.tempPassword}
                </code>
                . Share it privately; they can also sign in with an emailed link and change it under
                Account.
              </p>
            ) : (
              <p className="mt-1">Local mode: they can sign in from the login page.</p>
            )}
          </Notice>
        </div>
      )}

      {adding && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">Add a driver or admin</h2>
          <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email">
              {(id) => (
                <input
                  id={id}
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Full name">
              {(id) => (
                <input
                  id={id}
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Phone (optional)">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Role">
              {(id) => (
                <select
                  id={id}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as TeamUser["role"] })}
                  className={inputClass}
                >
                  <option value="driver">Driver: sees only their own routes</option>
                  <option value="admin">Admin: full access</option>
                </select>
              )}
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary">
                Create account
              </Button>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">Edit {editing.email}</h2>
          <form onSubmit={saveEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name">
              {(id) => (
                <input
                  id={id}
                  required
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Phone">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Role">
              {(id) => (
                <select
                  id={id}
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as TeamUser["role"] })
                  }
                  className={inputClass}
                >
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand)]"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active (can sign in)
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary">
                Save
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {users === null ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {users.map((u) => (
            <li
              key={u.id}
              className={`flex flex-wrap items-center gap-3 p-3 ${u.active ? "" : "opacity-60"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.full_name || "(no name)"}{" "}
                  <span className="text-xs font-normal text-muted">
                    {u.role}
                    {u.active ? "" : " · inactive"}
                  </span>
                </p>
                <p className="break-all text-sm text-muted">{u.email}</p>
              </div>
              <Button size="sm" onClick={() => setEditing(u)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
