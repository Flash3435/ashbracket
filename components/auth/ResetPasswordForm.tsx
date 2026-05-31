"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  mapPasswordUpdateError,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
} from "@/lib/auth/authFormValidation";

type Phase = "loading" | "form" | "link-invalid" | "success";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const supabase = createClient();
      const authError = searchParams.get("error");
      const errorCode = searchParams.get("error_code");
      const errorDescription = searchParams.get("error_description");

      if (authError || errorCode) {
        if (!cancelled) {
          setLinkError(
            errorDescription?.replace(/\+/g, " ") ??
              RESET_LINK_INVALID_MESSAGE,
          );
          setPhase("link-invalid");
        }
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeErr) {
          setLinkError(
            mapPasswordUpdateError(exchangeErr.message) ||
              RESET_LINK_INVALID_MESSAGE,
          );
          setPhase("link-invalid");
          return;
        }
        router.replace("/reset-password");
        setPhase("form");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setPhase("form");
        return;
      }

      setLinkError(RESET_LINK_INVALID_MESSAGE);
      setPhase("link-invalid");
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Choose a stronger password (at least 6 characters).");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(mapPasswordUpdateError(updateErr.message));
      return;
    }

    setPhase("success");
  }

  if (phase === "loading") {
    return (
      <div className="ash-surface p-6 text-sm text-ash-muted">
        Verifying your reset link…
      </div>
    );
  }

  if (phase === "link-invalid") {
    return (
      <div className="ash-surface space-y-4 p-6">
        <p className="text-sm text-red-300" role="alert">
          {linkError ?? RESET_LINK_INVALID_MESSAGE}
        </p>
        <Link
          href="/forgot-password"
          className="btn-primary inline-flex w-full justify-center text-sm no-underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div
        className="ash-surface space-y-4 p-6 text-sm text-ash-accent"
        role="status"
      >
        <p>{PASSWORD_RESET_SUCCESS_MESSAGE}</p>
        <Link
          href="/login"
          className="btn-primary inline-flex w-full justify-center text-sm no-underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="ash-surface space-y-4 p-6">
      <p className="text-sm leading-relaxed text-ash-muted">
        Choose a new password for your AshBracket account.
      </p>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          New password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Confirm password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
