"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  mapPasswordUpdateError,
  mapResetLinkAuthParams,
  mapResetLinkExchangeError,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
  RESET_LINK_MISSING_MESSAGE,
} from "@/lib/auth/authFormValidation";
import {
  clearAuthHashFromUrl,
  hasRecoveryTokensInHash,
} from "@/lib/auth/recoveryUrlParams";

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

      const authParamMessage = mapResetLinkAuthParams({
        error: authError,
        errorCode,
        errorDescription,
      });
      if (authParamMessage) {
        if (!cancelled) {
          setLinkError(authParamMessage);
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
          setLinkError(mapResetLinkExchangeError(exchangeErr.message));
          setPhase("link-invalid");
          return;
        }
        clearAuthHashFromUrl();
        router.replace("/reset-password");
        setPhase("form");
        return;
      }

      if (hasRecoveryTokensInHash()) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (cancelled) return;
        const {
          data: { session: hashSession },
        } = await supabase.auth.getSession();
        if (hashSession) {
          clearAuthHashFromUrl();
          router.replace("/reset-password");
          setPhase("form");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setPhase("form");
        return;
      }

      setLinkError(RESET_LINK_MISSING_MESSAGE);
      setPhase("link-invalid");
    }

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setLinkError(null);
        clearAuthHashFromUrl();
        router.replace("/reset-password");
        setPhase("form");
      }
    });

    void establishRecoverySession();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
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
      setError(PASSWORD_MISMATCH_MESSAGE);
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

    await supabase.auth.signOut();
    setPhase("success");
  }

  if (phase === "success") {
    return (
      <div className="ash-surface space-y-4 p-6 text-sm" role="status">
        <p className="text-ash-accent">{PASSWORD_RESET_SUCCESS_MESSAGE}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="btn-primary inline-flex text-sm no-underline"
          >
            Sign in
          </Link>
          <Link
            href="/account"
            className="btn-ghost inline-flex text-sm no-underline ring-1 ring-ash-border"
          >
            My account
          </Link>
        </div>
      </div>
    );
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
