"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimNhlParticipationInvite } from "@/lib/nhl/join/actions";
import type { NhlPeekInviteResult } from "@/lib/nhl/join/invite";

type NhlJoinInvitePanelProps = {
  inviteToken: string;
  initialPeek: NhlPeekInviteResult;
  isSignedIn: boolean;
  loginHref: string;
  signupHref: string;
  afterClaimRedirect: string;
};

export function NhlJoinInvitePanel({
  inviteToken,
  initialPeek,
  isSignedIn,
  loginHref,
  signupHref,
  afterClaimRedirect,
}: NhlJoinInvitePanelProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!initialPeek.ok) {
    return (
      <div className="ash-surface space-y-3 p-6">
        <p className="text-sm text-red-200" role="alert">
          {initialPeek.message}
        </p>
        <p className="text-sm text-slate-400">
          Ask your organizer for a fresh NHL invite link, or open your{" "}
          <Link href="/nhl/account" className="ash-link font-medium">
            NHL account
          </Link>{" "}
          if you are already in.
        </p>
      </div>
    );
  }

  const peek = initialPeek;

  if (peek.alreadyClaimed) {
    return (
      <div className="ash-surface space-y-4 p-6">
        <p className="text-sm text-slate-200">
          You have already accepted this NHL invite with the account you are signed in with.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/nhl/account" className="btn-primary inline-flex text-sm no-underline">
            NHL account
          </Link>
          <Link href="/nhl/picks" className="btn-ghost inline-flex text-sm no-underline">
            Matchup preview
          </Link>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="ash-surface space-y-4 p-6">
        <p className="text-sm text-slate-300">
          Sign in or create an AshBracket account with the email this NHL invite was sent to. Your
          credentials work across the whole site, including the main World Cup pools and this NHL
          section.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link href={loginHref} className="btn-primary inline-flex justify-center text-sm no-underline">
            Sign in
          </Link>
          <Link href={signupHref} className="btn-ghost inline-flex justify-center text-sm no-underline">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  function onAccept(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await claimNhlParticipationInvite(inviteToken);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.push(afterClaimRedirect);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onAccept} className="ash-surface space-y-4 p-6">
      <p className="text-sm text-slate-300">
        You are signed in as a participant. Accept this invite to link your account to{" "}
        <span className="font-medium text-slate-100">{peek.editionName}</span>{" "}
        <span className="text-slate-500">({peek.seasonLabel})</span>.
      </p>
      {formError ? (
        <p className="text-sm text-red-200" role="alert">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Joining…" : "Accept NHL invite"}
      </button>
    </form>
  );
}
