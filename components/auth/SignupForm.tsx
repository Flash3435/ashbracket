"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SignupFormProps = {
  /** Validated server-side (see `safeRedirectPath`). */
  redirectAfterSignup: string;
};

export function SignupForm({ redirectAfterSignup }: SignupFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    if (data.session) {
      router.push(redirectAfterSignup);
      router.refresh();
      return;
    }
    setInfo(
      "Check your email to confirm your address, then return here to sign in.",
    );
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
          autoComplete="new-password"
          required
          minLength={6}
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
      {info ? (
        <p className="text-sm text-emerald-800" role="status">
          {info}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
