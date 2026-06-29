"use client";

import { sendPasswordResetSupportAction } from "../../app/(worldcup)/admin/pilot/actions";
import { useState, useTransition } from "react";

const SUPPORT_SENT_MESSAGE =
  "If an account exists for that email, a recovery email was sent with a link to /reset-password. Ask the user to check inbox and spam.";

export function AdminPasswordResetSupportPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const trimmed = email.trim();
    startTransition(async () => {
      const result = await sendPasswordResetSupportAction(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(SUPPORT_SENT_MESSAGE);
      if (process.env.NODE_ENV === "development") {
        setMessage(`${SUPPORT_SENT_MESSAGE} (redirect_to=${result.redirectTo})`);
      }
    });
  }

  return (
    <section className="rounded-lg border border-ash-border bg-ash-body/30 p-4">
      <h2 className="text-sm font-semibold text-ash-text">Password reset (support)</h2>
      <p className="mt-1 text-sm text-ash-muted">
        Send a recovery email that lands on{" "}
        <code className="text-xs">/reset-password</code>. Do not use Supabase
        Dashboard “Send password recovery” — that may redirect to the homepage.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
            User email
          </span>
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="w-full max-w-md rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:opacity-50"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-ash-accent" role="status">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send recovery email"}
        </button>
      </form>
    </section>
  );
}
