"use client";

import { createClient } from "@/lib/supabase/client";
import {
  isValidEmailFormat,
  mapForgotPasswordRequestError,
} from "@/lib/auth/authFormValidation";
import { useState } from "react";

const RESET_EMAIL_SENT_MESSAGE =
  "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder — the link expires after a while.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = email.trim();
    if (!isValidEmailFormat(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    setLoading(false);

    if (resetErr) {
      const mapped = mapForgotPasswordRequestError(resetErr.message);
      if (mapped !== resetErr.message) {
        setError(mapped);
        return;
      }
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
