"use client";

import {
  assertPasswordResetRedirectUrl,
  buildPasswordResetRedirectUrlForClient,
} from "@/lib/auth/passwordResetRedirect";
import { useState } from "react";

const RESET_EMAIL_SENT_MESSAGE =
  "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder — the link expires after a while.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devRedirectHint, setDevRedirectHint] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setDevRedirectHint(null);

    const trimmed = email.trim();

    setLoading(true);

    const redirectTo = buildPasswordResetRedirectUrlForClient();
    try {
      assertPasswordResetRedirectUrl(redirectTo);
    } catch {
      setLoading(false);
      setError("Password reset is temporarily unavailable. Please try again later.");
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[auth] forgot-password redirectTo:", redirectTo);
      setDevRedirectHint(redirectTo);
    }

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: trimmed }),
    });

    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; redirectTo?: string }
      | null;

    setLoading(false);

    if (!res.ok || payload?.ok === false) {
      setError(payload?.error ?? "Could not send reset email. Try again in a few minutes.");
      return;
    }

    if (process.env.NODE_ENV === "development" && payload?.redirectTo) {
      setDevRedirectHint(payload.redirectTo);
      console.info("[auth] server confirmed redirectTo:", payload.redirectTo);
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div
        className="ash-surface space-y-3 p-6 text-sm text-ash-accent"
        role="status"
      >
        <p>{RESET_EMAIL_SENT_MESSAGE}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="ash-surface space-y-4 p-6">
      <p className="text-sm leading-relaxed text-ash-muted">
        Enter the email you use for AshBracket. We will send a link to choose a
        new password. The link opens on this site and expires after a while.
      </p>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Email
        </span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
        />
      </label>
      {devRedirectHint ? (
        <p className="font-mono text-xs text-ash-muted" data-testid="password-reset-redirect-debug">
          Dev: redirect_to={devRedirectHint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
