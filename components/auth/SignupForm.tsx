"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { claimParticipantInvite } from "../../lib/join/actions";

export type SignupInviteContext = {
  token: string;
  email: string;
};

type SignupFormProps = {
  /** Validated server-side (see `safeRedirectPath`). */
  redirectAfterSignup: string;
  /** Supabase `emailRedirectTo`: must match an entry in Supabase Redirect URLs. */
  emailConfirmRedirectUrl: string;
  /** Set only after server-side invite + email validation; signup uses this email, not user-editable input. */
  inviteContext?: SignupInviteContext | null;
  /** Login URL preserving post-auth return path (e.g. back to join with invite). */
  loginHref: string;
  /** When true (non-invite flows), show confirm password and require a match before submit. */
  requirePasswordConfirmation?: boolean;
};

function looksLikeExistingUserError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already registered") ||
    m.includes("email address is already")
  );
}

export function SignupForm({
  redirectAfterSignup,
  emailConfirmRedirectUrl,
  inviteContext,
  loginHref,
  requirePasswordConfirmation = false,
}: SignupFormProps) {
  const router = useRouter();
  const inviteMode = Boolean(inviteContext);
  const confirmPasswordRequired = inviteMode || requirePasswordConfirmation;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSignInInstead, setShowSignInInstead] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setShowSignInInstead(false);

    const signUpEmail = inviteMode
      ? (inviteContext!.email as string)
      : email.trim();

    if (confirmPasswordRequired && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signErr } = await supabase.auth.signUp({
      email: signUpEmail,
      password,
      options: {
        emailRedirectTo: emailConfirmRedirectUrl,
      },
    });
    setLoading(false);

    if (signErr) {
      if (looksLikeExistingUserError(signErr.message)) {
        setShowSignInInstead(true);
        setError(
          inviteMode
            ? "An account already exists for this email. Sign in with that account to accept your invite."
            : "An account already exists for this email. Sign in with that account.",
        );
        return;
      }
      setError(signErr.message);
      return;
    }

    if (data.session && inviteContext) {
      setLoading(true);
      const claim = await claimParticipantInvite(inviteContext.token);
      setLoading(false);
      if (!claim.ok) {
        setError(
          `${claim.message} You can try again from your invite link after signing in.`,
        );
        return;
      }
      router.push(
        `/account/picks?participant=${encodeURIComponent(claim.participantId)}`,
      );
      router.refresh();
      return;
    }

    if (data.session) {
      router.push(redirectAfterSignup);
      router.refresh();
      return;
    }

    setInfo(
      inviteContext
        ? "Check your email to confirm your address, then sign in — we will bring you back to finish joining your pool."
        : requirePasswordConfirmation
          ? "Check your email to confirm your address, then sign in to open the organizer dashboard."
          : "Check your email to confirm your address, then return here to sign in.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="ash-surface space-y-4 p-6">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Email
        </span>
        {inviteMode ? (
          <>
            <input
              type="email"
              autoComplete="email"
              readOnly
              value={inviteContext!.email}
              className="w-full cursor-not-allowed rounded-md border border-ash-border bg-ash-border/20 px-3 py-2 text-sm text-ash-text shadow-sm outline-none"
            />
            <p className="text-xs text-ash-muted">
              This account must use the same email address your organizer invited.
            </p>
          </>
        ) : (
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
          />
        )}
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Password
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
      {confirmPasswordRequired ? (
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
      ) : null}
      {error ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-red-300">{error}</p>
          {showSignInInstead ? (
            <Link
              href={loginHref}
              className="btn-primary inline-flex w-full justify-center text-sm no-underline"
            >
              Sign in instead
            </Link>
          ) : null}
        </div>
      ) : null}
      {info ? (
        <div className="space-y-3 text-sm text-ash-accent" role="status">
          <p>{info}</p>
          <Link
            href={loginHref}
            className="ash-link font-medium text-ash-accent underline"
          >
            Go to sign in
          </Link>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
