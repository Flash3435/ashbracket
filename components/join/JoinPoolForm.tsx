"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  claimPoolParticipant,
  peekJoinablePool,
  registerInPool,
  type PeekJoinResult,
} from "../../lib/join/actions";

type JoinPoolFormProps = {
  initialCode: string;
  isSignedIn: boolean;
  loginHref: string;
  signupHref: string;
};

export function JoinPoolForm({
  initialCode,
  isSignedIn,
  loginHref,
  signupHref,
}: JoinPoolFormProps) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState(initialCode);
  const [peek, setPeek] = useState<PeekJoinResult | null>(
    initialCode.trim() ? null : null,
  );
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"create" | "claim">("create");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolved = peek?.ok ? peek : null;

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

  const poolLabel = useMemo(() => {
    if (!resolved) return null;
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Joining <span className="font-semibold">{resolved.poolName}</span>
      </p>
    );
  }, [resolved]);

  useEffect(() => {
    const c = initialCode.trim();
    if (!c) return;
    startTransition(async () => {
      const result = await peekJoinablePool(c);
      setPeek(result);
      if (!result.ok) {
        setFormError(result.message);
      }
    });
  }, [initialCode]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-800">1. Pool code</h2>
        <p className="text-sm text-zinc-600">
          Paste the code from your invite link, or open a link that already
          includes{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
            ?code=
          </code>
          .
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-700/20"
              placeholder="e.g. ASH2026"
            />
          </label>
          <button
            type="button"
            disabled={pending || !joinCode.trim()}
            onClick={verifyCode}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && !resolved ? "Checking…" : "Verify code"}
          </button>
        </div>
        {poolLabel}
      </section>

      {!isSignedIn ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800">2. Your account</h2>
          <p className="text-sm text-zinc-600">
            Sign in or sign up with Supabase Auth. After that, you can create or
            claim your pool profile here.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={loginHref}
              className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
            >
              Sign in
            </Link>
            <Link
              href={signupHref}
              className="inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Create account
            </Link>
          </div>
        </section>
      ) : null}

      {isSignedIn && resolved ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-800">2. Pool profile</h2>
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
          <p className="text-sm text-zinc-600">
            {mode === "create"
              ? "Choose the display name shown on the leaderboard."
              : "Use the exact display name your organizer used when they created your row (case-insensitive)."}
          </p>
          <form onSubmit={onRegisterOrClaim} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Display name
              </span>
              <input
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>
            {formError ? (
              <p className="text-sm text-red-700" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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

      {isSignedIn && !resolved ? (
        <p className="text-sm text-zinc-500">
          Verify a join code above to continue.
        </p>
      ) : null}
    </div>
  );
}
