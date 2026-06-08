"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SignInWithEmailForm } from "./SignInWithEmailForm";

type LoginFormProps = {
  /** After password sign-in, client navigates here; server resolves `next` and redirects (e.g. `/account` or `/admin`). */
  postLoginHref: string;
  /** Sign-up URL (preserves `next` when the user opened login with a return path). */
  signupHref: string;
  /** Shown when already signed in but cannot access requested admin destination. */
  blockedEmail?: string | null;
  showForbiddenMessage: boolean;
  /** Invalid or expired Supabase email confirmation link. */
  showEmailConfirmFailed?: boolean;
  /** Password was updated via the reset-password flow. */
  showPasswordResetSuccess?: boolean;
  /** After sign-out from the blocked-admin state (defaults to `/login`). */
  signOutRedirectTo?: string;
  /** “My account” link in blocked-admin state (defaults to `/account`). */
  blockedStateAccountHref?: string;
  /** When true, copy and links assume the NHL section instead of the main site. */
  isNhlSurface?: boolean;
  /** When true, copy and links assume the NHL Draft 2026 Pick'em section. */
  isNhlDraft26Surface?: boolean;
};

export function LoginForm({
  postLoginHref,
  signupHref,
  blockedEmail,
  showForbiddenMessage,
  showEmailConfirmFailed,
  showPasswordResetSuccess,
  signOutRedirectTo = "/login",
  blockedStateAccountHref = "/account",
  isNhlSurface = false,
  isNhlDraft26Surface = false,
}: LoginFormProps) {
  const isolatedSurface = isNhlDraft26Surface || isNhlSurface;
  const router = useRouter();

  async function onSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(signOutRedirectTo);
    router.refresh();
  }

  if (blockedEmail) {
    return (
      <div className="space-y-4">
        {showForbiddenMessage ? (
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            {isNhlDraft26Surface
              ? "That NHL Draft admin page is only available to AshBracket global admins."
              : isNhlSurface
                ? "That NHL admin page is only available to AshBracket global admins."
                : "This area is for pool organizers."}
          </p>
        ) : null}
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Signed in as <span className="font-medium text-amber-50">{blockedEmail}</span>.
          {isNhlDraft26Surface ? (
            <>
              {" "}
              This account is not authorized for NHL Draft admin tools. Sign out and sign in with a
              global admin account, or return to your picks.
            </>
          ) : isNhlSurface ? (
            <>
              {" "}
              This account is not authorized for NHL admin tools. Sign out and sign in with a
              global admin account, or return to your NHL participant pages.
            </>
          ) : (
            <>
              {" "}
              You don’t have access to the admin area yet. Want to run your own
              pool? Create a new pool, or sign out and use a different
              account. You can also ask a pool owner to add you in{" "}
              <code className="rounded bg-amber-950/60 px-1 text-amber-100">
                pool_admins
              </code>{" "}
              (organizers) — app-wide access is only for global administrators in{" "}
              <code className="rounded bg-amber-950/60 px-1 text-amber-100">
                app_admins
              </code>
              .
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {!isolatedSurface ? (
            <Link
              href="/account/pools/new"
              className="btn-primary inline-flex items-center text-sm"
            >
              Create your own pool
            </Link>
          ) : null}
          <Link
            href={blockedStateAccountHref}
            className="btn-ghost inline-flex items-center text-sm ring-1 ring-ash-border"
          >
            {isNhlDraft26Surface
              ? "My picks"
              : isNhlSurface
                ? "NHL account"
                : "My account"}
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg bg-ash-surface px-3 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/30"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showPasswordResetSuccess ? (
        <p
          className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}
      {showEmailConfirmFailed ? (
        <p className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          That confirmation link is invalid or has expired. Sign in below if you
          already finished setup, or sign up again to get a new confirmation email
          from AshBracket.
        </p>
      ) : null}
      <SignInWithEmailForm
        redirectAfterLogin={postLoginHref}
        forgotPasswordHref={isolatedSurface ? undefined : "/forgot-password"}
      />
      <p className="text-center text-sm text-ash-muted">
        No account yet?{" "}
        <Link href={signupHref} className="ash-link">
          Sign up
        </Link>
      </p>
    </div>
  );
}
