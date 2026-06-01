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
  getMyParticipantIdInPool,
  joinPool,
  peekJoinablePool,
  peekParticipantInvite,
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
  /** When true, the join code comes from a share URL and cannot be edited. */
  lockJoinCode?: boolean;
  /** Where to send the user after a successful create/claim via join code. */
  afterSuccessfulJoin?: "account" | "picks";
  /**
   * When provided with `lockJoinCode`, avoids a second peek RPC on the client
   * (RSC already resolved the pool).
   */
  joinCodePeek?: PeekJoinResult | null;
};

export function JoinPoolForm({
  initialCode,
  initialInvite = "",
  isSignedIn,
  loginHref,
  signupHref,
  lockJoinCode = false,
  afterSuccessfulJoin = "account",
  joinCodePeek,
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
  const [joinStep, setJoinStep] = useState<"form" | "confirm" | "ambiguous">(
    "form",
  );
  const [pendingMatch, setPendingMatch] = useState<{
    participantId: string;
    matchedDisplayName: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** `undefined` = not checked yet; `null` = not already in pool; string = existing participant id */
  const [existingPoolParticipantId, setExistingPoolParticipantId] = useState<
    string | null | undefined
  >(undefined);

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

  const finishJoin = useCallback(
    (participantId: string) => {
      if (afterSuccessfulJoin === "picks") {
        const q = new URLSearchParams({
          participant: participantId,
          joined: "1",
        });
        router.push(`/account/picks?${q.toString()}`);
      } else {
        router.push("/account");
      }
      router.refresh();
    },
    [router, afterSuccessfulJoin],
  );

  const runJoin = useCallback(
    (intent: "initial" | "confirm_existing" | "create_new") => {
      if (!resolved) return;
      setFormError(null);
      startTransition(async () => {
        const result = await joinPool(
          resolved.poolId,
          joinCode.trim(),
          displayName,
          intent,
        );
        if (result.status === "success") {
          finishJoin(result.participantId);
          return;
        }
        if (result.status === "needs_confirmation") {
          setPendingMatch({
            participantId: result.participantId,
            matchedDisplayName: result.matchedDisplayName,
          });
          setJoinStep("confirm");
          return;
        }
        if (result.status === "ambiguous") {
          setFormError(result.message);
          setJoinStep("ambiguous");
          return;
        }
        setFormError(result.message);
      });
    },
    [resolved, joinCode, displayName, finishJoin],
  );

  const onJoinPool = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      runJoin("initial");
    },
    [runJoin],
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
          joined: "1",
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
    if (lockJoinCode) {
      setJoinCode(initialCode.trim());
    }
  }, [lockJoinCode, initialCode]);

  useEffect(() => {
    if (inviteMode) {
      setExistingPoolParticipantId(undefined);
      startTransition(async () => {
        const result = await peekParticipantInvite(inviteToken);
        setInvitePeek(result);
      });
      return;
    }

    if (lockJoinCode && joinCodePeek !== undefined) {
      setPeek(joinCodePeek);
      if (joinCodePeek && !joinCodePeek.ok) {
        setFormError(joinCodePeek.message);
      } else {
        setFormError(null);
      }
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
  }, [initialCode, inviteMode, inviteToken, lockJoinCode, joinCodePeek]);

  useEffect(() => {
    if (!isSignedIn) {
      setExistingPoolParticipantId(undefined);
      return;
    }
    if (inviteMode) {
      if (!resolvedInvite) {
        setExistingPoolParticipantId(undefined);
        return;
      }
      setExistingPoolParticipantId(undefined);
      startTransition(async () => {
        const id = await getMyParticipantIdInPool(resolvedInvite.poolId);
        setExistingPoolParticipantId(id);
      });
      return;
    }
    if (!resolved) {
      setExistingPoolParticipantId(undefined);
      return;
    }
    setExistingPoolParticipantId(undefined);
    startTransition(async () => {
      const id = await getMyParticipantIdInPool(resolved.poolId);
      setExistingPoolParticipantId(id);
    });
  }, [inviteMode, isSignedIn, resolvedInvite, resolved]);

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
      ) : lockJoinCode ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ash-text">1. Pool</h2>
          <p className="text-sm text-ash-muted">
            This page was opened from a share link. The join code is included in
            the URL — you do not need to type it.
          </p>
          <p className="text-xs text-ash-muted">
            Join code:{" "}
            <span className="font-mono text-ash-text">{joinCode.trim()}</span>
          </p>
          {peek && !peek.ok ? (
            <p className="text-sm text-red-300" role="alert">
              {peek.message}
            </p>
          ) : null}
          {pending && !peek ? (
            <p className="text-sm text-ash-muted">Checking pool…</p>
          ) : null}
          {poolLabel}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ash-text">1. Pool code</h2>
          <p className="text-sm text-ash-muted">
            Paste the code from your pool, or open a link that already includes{" "}
            <code className="rounded bg-ash-body px-1 py-0.5 text-xs text-ash-text">
              ?code=
            </code>{" "}
            or use a path link like{" "}
            <code className="rounded bg-ash-body px-1 py-0.5 text-xs text-ash-text">
              /join/your-code
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
              ? "Create your account using the email address your organizer invited. If you already have an account with that email, sign in instead."
              : "Sign in or sign up. After that, choose the name you want on the leaderboard and join the pool."}
          </p>
          <div className="flex flex-wrap gap-3">
            {inviteMode ? (
              <>
                <Link href={signupHref} className="btn-primary inline-flex text-sm">
                  Create account
                </Link>
                <Link href={loginHref} className="btn-ghost inline-flex text-sm">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <Link href={loginHref} className="btn-primary inline-flex text-sm">
                  Sign in
                </Link>
                <Link href={signupHref} className="btn-ghost inline-flex text-sm">
                  Create account
                </Link>
              </>
            )}
          </div>
        </section>
      ) : null}

      {inviteMode && isSignedIn && resolvedInvite ? (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-ash-text">2. Connect your bracket</h2>
          {existingPoolParticipantId === undefined ? (
            <p className="text-sm text-ash-muted">Checking your pool membership…</p>
          ) : existingPoolParticipantId ? (
            <>
              <p className="text-sm text-ash-muted">
                Your account is already in this pool. The invite may be for a
                separate placeholder row your organizer added; you do not need
                to accept it again.
              </p>
              <Link
                href={`/account/picks?participant=${encodeURIComponent(existingPoolParticipantId)}`}
                className="btn-primary inline-flex text-sm"
              >
                Open bracket picks
              </Link>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>
      ) : null}

      {!inviteMode && isSignedIn && resolved ? (
        <section className="space-y-4">
          {existingPoolParticipantId === undefined ? (
            <>
              <h2 className="text-sm font-bold text-ash-text">2. Your name</h2>
              <p className="text-sm text-ash-muted">Checking your pool membership…</p>
            </>
          ) : existingPoolParticipantId ? (
            <>
              <h2 className="text-sm font-bold text-ash-text">2. Your name</h2>
              <p className="text-sm text-ash-muted">
                You’re already in this pool with your signed-in account. Head to
                your picks or account anytime.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/account/picks?participant=${encodeURIComponent(existingPoolParticipantId)}`}
                  className="btn-primary inline-flex text-sm"
                >
                  Open bracket picks
                </Link>
                <Link href="/account" className="btn-ghost inline-flex text-sm">
                  Account home
                </Link>
              </div>
            </>
          ) : joinStep === "confirm" && pendingMatch ? (
            <>
              <h2 className="text-lg font-bold text-ash-text">
                Join {resolved.poolName}
              </h2>
              <p className="text-sm text-ash-muted">
                We found an existing profile named{" "}
                <span className="font-semibold text-ash-text">
                  {pendingMatch.matchedDisplayName}
                </span>{" "}
                in this pool. Is this you?
              </p>
              {formError ? (
                <p className="text-sm text-red-300" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runJoin("confirm_existing")}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Joining…" : "Yes, use this profile"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runJoin("create_new")}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                >
                  No, create a new profile
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setJoinStep("form");
                    setPendingMatch(null);
                    setFormError(null);
                  }}
                  className="text-sm text-ash-muted underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </>
          ) : joinStep === "ambiguous" ? (
            <>
              <h2 className="text-lg font-bold text-ash-text">
                Join {resolved.poolName}
              </h2>
              {formError ? (
                <p className="text-sm text-red-300" role="alert">
                  {formError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setJoinStep("form");
                  setFormError(null);
                }}
                className="text-sm text-ash-muted underline-offset-2 hover:underline"
              >
                Try a different name
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-ash-text">
                Join {resolved.poolName}
              </h2>
              <p className="text-sm text-ash-muted">
                Choose the name that should appear on the leaderboard.
              </p>
              <form onSubmit={onJoinPool} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                    Display name
                  </span>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setFormError(null);
                    }}
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
                  {pending ? "Joining…" : "Join pool"}
                </button>
              </form>
            </>
          )}
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
