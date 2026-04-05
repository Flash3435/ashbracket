"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateSamplePoolSettingsAction } from "../../app/admin/settings/actions";
import type { PoolSettingsEditable } from "../../lib/pools/poolSettingsDb";

type PoolSettingsFormProps = {
  initial: PoolSettingsEditable;
  disabled?: boolean;
};

function toDatetimeLocalFromIso(iso: string | null): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalToIso(local: string): string | null {
  const t = local.trim();
  if (t === "") return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PoolSettingsForm({
  initial,
  disabled = false,
}: PoolSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initial.name);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [lockLocal, setLockLocal] = useState(() =>
    toDatetimeLocalFromIso(initial.lockAt),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setName(initial.name);
    setIsPublic(initial.isPublic);
    setLockLocal(toDatetimeLocalFromIso(initial.lockAt));
  }, [initial]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(false), 4000);
    return () => window.clearTimeout(t);
  }, [success]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setActionError(null);
    setSuccess(false);
    const lockAt = fromDatetimeLocalToIso(lockLocal);

    startTransition(async () => {
      const res = await updateSamplePoolSettingsAction({
        name,
        isPublic,
        lockAt,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setName(res.pool.name);
      setIsPublic(res.pool.isPublic);
      setLockLocal(toDatetimeLocalFromIso(res.pool.lockAt));
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {actionError ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Saved. Public pages will show updated name, visibility, and lock time
          after refresh.
        </p>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor="pool-name"
          className="block text-sm font-medium text-zinc-800"
        >
          Pool name
        </label>
        <input
          id="pool-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled || isPending}
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-zinc-100"
          autoComplete="off"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="pool-public"
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          disabled={disabled || isPending}
          className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
        />
        <label htmlFor="pool-public" className="text-sm text-zinc-800">
          Public pool (leaderboard and rules visible without admin sign-in)
        </label>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="pool-lock"
          className="block text-sm font-medium text-zinc-800"
        >
          Picks lock at
        </label>
        <input
          id="pool-lock"
          type="datetime-local"
          value={lockLocal}
          onChange={(e) => setLockLocal(e.target.value)}
          disabled={disabled || isPending}
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-zinc-100"
        />
        <p className="text-xs text-zinc-500">
          Uses your browser&apos;s local timezone. Clear the field to remove a
          lock deadline (stored as empty in the database).
        </p>
      </div>

      <div>
        <button
          type="submit"
          disabled={disabled || isPending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
