"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  claimParticipantInvite,
  claimPoolParticipant,
  peekJoinablePool,
  peekParticipantInvite,
  registerInPool,
  type PeekInviteResult,
  type PeekJoinResult,
} from "../../lib/join/actions";

type JoinPoolFormProps = {
  initialCode: string;
  /** Personal invite token from `?invite=` — takes precedence over join code. */
  initialInvite?: string;
  isSignedIn: boolean;
  loginHref: string;
  signupHref: string;
};

export function JoinPoolForm({
  initialCode,
  initialInvite = "",
  isSignedIn,
  loginHref,
  signupHref,
}: JoinPoolFormProps) {
  const router = useRouter();
  const inviteToken = initialInvite.trim();
  const inviteMode = inviteToken.length > 0;

  const [joinCode, setJoinCode] = useState(initialCode);
  const [peek, setPeek] = useState<PeekJoinResult | null>(
    initialCode.trim() && !inviteMode ? null : null,
  );
  const [invitePeek, setInvitePeek] = useState<PeekInviteResult | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"create" | "claim">("create");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolved = peek?.ok ? peek : null;
  const resolvedInvite = invitePeek?.ok ? invitePeek : null;

  const verifyCode = useCallback(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await peekJoinablePool(joinCode);
      setPeek(result);
      if (!result.ok) {
        setFormError(result.message);
      }
    });
  }, [joinCode]);

  const onRegisterOrClaim = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!resolved) return;
      setFormError(null);
      startTransition(async () => {
        const fn =
          mode === "create" ? registerInPool : claimPoolParticipant;
        const result = await fn(
          resolved.poolId,
          joinCode.trim(),
          displayName.trim(),
        );
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        router.push("/account");
        router.refresh();
      });
    },
    [resolved, mode, joinCode, displayName, router],
  );

  const onAcceptInvite = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteToken) return;
      setFormError(null);
      startTransition(async () => {
        const result = await claimParticipantInvite(inviteToken);
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        const q = new URLSearchParams({
          participant: result.participantId,
        });
        router.push(`/account/picks?${q.toString()}`);
        router.refresh();
      });
    },
    [inviteToken, router],
  );

  const poolLabel = useMemo(() => {
    if (!resolved) return null;
    return (
      <p className="rounded-md border border-ash-accent/30 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted">
        Joining{" "}
        <span className="font-semibold text-ash-text">{resolved.poolName}</span>
      </p>
    );
  }, [resolved]);

  const invitePoolLabel = useMemo(() => {
    if (!resolvedInvite) return null;
    return (
      <p className="rounded-md border border-ash-accent/30 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted">
        Pool:{" "}
        <span className="font-semibold text-ash-text">
          {resolvedInvite.poolName}
        </span>
        <span className="text-ash-muted"> · You’re listed as </span>
        <span className="font-semibold text-ash-text">
          {resolvedInvite.displayName}
        </span>
      </p>
    );
  }, [resolvedInvite]);

  useEffect(() => {
    if (inviteMode) {
      startTransition(async () => {
        const result = await peekParticipantInvite(inviteToken);
        setInvitePeek(result);
      });
      return;
    }

    const c = initialCode.trim();
    if (!c) return;
    startTransition(async () => {
      const result = await peekJoinablePool(c);
      setPeek(result);
      if (!result.ok) {
        setFormError(result.message);
      }
    });
  }, [initialCode, inviteMode, inviteToken]);

  return (
    <div className="space-y-8">
      {inviteMode ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ash-text">1. Your invite</h2>
          <p className="text-sm text-ash-muted">
            This link is tied to a specific pool and the name your organizer set
            for you. Use the same email address they invited — that is how we
            connect your account.
          </p>
          {invitePoolLabel}
          {invitePeek && !invitePeek.ok ? (
            <p className="text-sm text-red-300" role="alert">
              {invitePeek.message}
            </p>
          ) : null}
          {pending && !invitePeek ? (
            <p className="text-sm text-ash-muted">Checking your invite…</p>
          ) : null}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ash-text">1. Pool code</h2>
          <p className="text-sm text-ash-muted">
            Paste the code from your pool, or open a link that already includes{" "}
            <code className="rounded bg-ash-body px-1 py-0.5 text-xs text-ash-text">
              ?code=
            </code>
            .
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Join code
              </span>
              <input
                type="text"
                autoComplete="off"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  setPeek(null);
                }}
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none focus:border-ash-accent focus:ring-2 focus:ring-ash-accent/20"
                placeholder="e.g. ASH2026"
              />
            </label>
            <button
              type="button"
              disabled={pending || !joinCode.trim()}
              onClick={verifyCode}
              className="rounded-lg bg-ash-surface px-4 py-2 text-sm font-medium text-ash-text ring-1 ring-ash-border transition-colors hover:bg-ash-border/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && !resolved ? "Checking…" : "Verify code"}
            </button>
          </div>
          {poolLabel}
        </section>
      )}

      {!isSignedIn ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ash-text">2. Your account</h2>
          <p className="text-sm text-ash-muted">
            {inviteMode
              ? "Sign in or create an account using the email address your organizer used on the invite."
              : "Sign in or sign up. After that, you can create or claim your pool profile here."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={loginHref} className="btn-primary inline-flex text-sm">
              Sign in
            </Link>
            <Link href={signupHref} className="btn-ghost inline-flex text-sm">
              Create account
            </Link>
          </div>
        </section>
      ) : null}

      {inviteMode && isSignedIn && resolvedInvite ? (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-ash-text">2. Connect your bracket</h2>
          <p className="text-sm text-ash-muted">
            One step left — we will link your signed-in account to this pool
            profile and take you to your picks.
          </p>
          <form onSubmit={onAcceptInvite} className="space-y-4">
            {formError ? (
              <p className="text-sm text-red-300" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Connecting…" : "Join pool & open picks"}
            </button>
          </form>
        </section>
      ) : null}

      {!inviteMode && isSignedIn && resolved ? (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-ash-text">2. Pool profile</h2>
          <div className="flex gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="joinMode"
                checked={mode === "create"}
                onChange={() => setMode("create")}
              />
              New profile
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="joinMode"
                checked={mode === "claim"}
                onChange={() => setMode("claim")}
              />
              Claim existing (organizer added me)
            </label>
          </div>
          <p className="text-sm text-ash-muted">
            {mode === "create"
              ? "Choose the display name shown on the leaderboard."
              : "Use the exact display name your organizer used when they created your row (case-insensitive)."}
          </p>
          <form onSubmit={onRegisterOrClaim} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Display name
              </span>
              <input
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none focus:border-ash-accent focus:ring-2 focus:ring-ash-accent/20"
              />
            </label>
            {formError ? (
              <p className="text-sm text-red-300" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Create profile"
                  : "Claim profile"}
            </button>
          </form>
        </section>
      ) : null}

      {!inviteMode && isSignedIn && !resolved ? (
        <p className="text-sm text-ash-muted">
          Verify a join code above to continue.
        </p>
      ) : null}
    </div>
  );
}
