"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SignInWithEmailFormProps = {
  /** Validated server-side (see `safeRedirectPath`). */
  redirectAfterLogin: string;
  submitLabel?: string;
};

export function SignInWithEmailForm({
  redirectAfterLogin,
  submitLabel = "Sign in",
}: SignInWithEmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    router.push(redirectAfterLogin);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Email
        </span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Password
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Signing in…" : submitLabel}
      </button>
    </form>
  );
}
