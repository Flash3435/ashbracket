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
};

export function LoginForm({
  postLoginHref,
  signupHref,
  blockedEmail,
  showForbiddenMessage,
  showEmailConfirmFailed,
}: LoginFormProps) {
  const router = useRouter();

  async function onSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (blockedEmail) {
    return (
      <div className="space-y-4">
        {showForbiddenMessage ? (
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            That page is only available to pool organizers (admin accounts).
          </p>
        ) : null}
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Signed in as <span className="font-medium text-amber-50">{blockedEmail}</span>.
          This account is not authorized for the admin area. Sign out and use an
          organizer account, or ask an owner to add you in{" "}
          <code className="rounded bg-amber-950/60 px-1 text-amber-100">
            pool_admins
          </code>{" "}
          or{" "}
          <code className="rounded bg-amber-950/60 px-1 text-amber-100">
            app_admins
          </code>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg bg-ash-surface px-3 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/30"
          >
            Sign out
          </button>
          <Link
            href="/account"
            className="btn-ghost inline-flex items-center text-sm"
          >
            My account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showEmailConfirmFailed ? (
        <p className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          That confirmation link is invalid or has expired. Sign in below if you
          already finished setup, or sign up again to get a new confirmation email
          from AshBracket.
        </p>
      ) : null}
      <SignInWithEmailForm redirectAfterLogin={postLoginHref} />
      <p className="text-center text-sm text-ash-muted">
        No account yet?{" "}
        <Link href={signupHref} className="ash-link">
          Sign up
        </Link>
      </p>
    </div>
  );
}
