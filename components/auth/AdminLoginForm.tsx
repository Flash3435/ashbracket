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
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            That page is only available to pool organizers (admin accounts).
          </p>
        ) : null}
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Signed in as <span className="font-medium">{blockedEmail}</span>.
          {variant === "organizer" ? (
            <>
              {" "}
              This account is not in the admin list. Sign out and use an
              authorized organizer account, or ask an owner to add your user id
              to{" "}
              <code className="rounded bg-amber-100/80 px-1">app_admins</code>{" "}
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
            className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-900"
          >
            Sign out
          </button>
          {variant === "organizer" ? (
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Participant sign-in
            </Link>
          ) : (
            <Link
              href="/login?next=/admin"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
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
        <p className="text-center text-sm text-zinc-600">
          No account yet?{" "}
          <Link
            href={signupHref}
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      ) : null}
      {variant === "participant" ? (
        <p className="text-center text-sm text-zinc-500">
          Running the pool?{" "}
          <Link
            href="/login?next=/admin"
            className="font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Organizer sign-in
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-zinc-500">
          Joining as a player?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Participant sign-in
          </Link>
        </p>
      )}
    </div>
  );
}
