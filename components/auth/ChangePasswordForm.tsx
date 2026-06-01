"use client";

import {
  CHANGE_PASSWORD_SUCCESS_MESSAGE,
  mapChangePasswordUpdateError,
  mapReauthSignInError,
  validateChangePasswordFields,
} from "@/lib/auth/changePassword";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

type ChangePasswordFormProps = {
  userEmail: string;
};

export function ChangePasswordForm({ userEmail }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validateChangePasswordFields({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });
    if (signErr) {
      setLoading(false);
      setError(mapReauthSignInError(signErr.message));
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateErr) {
      setError(mapChangePasswordUpdateError(updateErr.message));
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setSuccess(true);
  }

  if (success) {
    return (
      <div
        className="ash-surface space-y-4 p-6"
        data-testid="change-password-success"
      >
        <p className="text-sm text-emerald-200" role="status">
          {CHANGE_PASSWORD_SUCCESS_MESSAGE}
        </p>
        <Link href="/account" className="ash-link text-sm">
          Back to my bracket
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="ash-surface max-w-lg space-y-4 p-6"
      data-testid="change-password-form"
    >
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Current password
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          New password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Confirm new password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
        />
      </label>
      {error ? (
        <p
          className="text-sm text-red-300"
          role="alert"
          data-testid="change-password-error"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
