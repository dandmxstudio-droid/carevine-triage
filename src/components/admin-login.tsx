"use client";
import { useActionState } from "react";
import { login } from "@/app/admin/actions";
import { Logo } from "./shared";
export function AdminLogin() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <main className="entry">
      <section className="entry-card">
        <Logo large />
        <h1>Admin sign in</h1>
        <form action={action} className="stack">
          <label className="reply-field">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={1024}
            />
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          <button className="button primary" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
