"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SignInWithEmailForm } from "./SignInWithEmailForm";

type AdminLoginFormProps = {
  /** Validated server-side (see `safeRedirectPath`). */
  redirectAfterLogin: string;
  /** Target after sign-up (same allowlist as `redirectAfterLogin`). */
  signupHref: string;
  /** Shown when already signed in but not in `app_admins` (or after a protected-route redirect). */
  blockedEmail?: string | null;
  showForbiddenMessage: boolean;
  /** Participant vs organizer copy and links. */
  variant: "participant" | "organizer";
};

export function AdminLoginForm({
  redirectAfterLogin,
  signupHref,
  blockedEmail,
  showForbiddenMessage,
  variant,
}: AdminLoginFormProps) {
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
          {variant === "organizer" ? (
            <>
              {" "}
              This account is not in the admin list. Sign out and use an
              authorized organizer account, or ask an owner to add your user id
              to{" "}
              <code className="rounded bg-amber-950/60 px-1 text-amber-100">app_admins</code>{" "}
              in Supabase.
            </>
          ) : (
            <>
              {" "}
              Use the participant links below if you are joining a pool, or sign
              out and sign in with an organizer account for Admin.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg bg-ash-surface px-3 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/30"
          >
            Sign out
          </button>
          {variant === "organizer" ? (
            <Link href="/login" className="btn-ghost inline-flex items-center text-sm">
              Participant sign-in
            </Link>
          ) : (
            <Link
              href="/login?next=/admin"
              className="btn-ghost inline-flex items-center text-sm"
            >
              Organizer sign-in
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SignInWithEmailForm redirectAfterLogin={redirectAfterLogin} />
      {variant === "participant" ? (
        <p className="text-center text-sm text-ash-muted">
          No account yet?{" "}
          <Link href={signupHref} className="ash-link">
            Sign up
          </Link>
        </p>
      ) : null}
      {variant === "participant" ? (
        <p className="text-center text-sm text-ash-muted">
          Running the pool?{" "}
          <Link href="/login?next=/admin" className="ash-link">
            Organizer sign-in
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-ash-muted">
          Joining as a player?{" "}
          <Link href="/login" className="ash-link">
            Participant sign-in
          </Link>
        </p>
      )}
    </div>
  );
}
