"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SignOutButtonProps = {
  redirectTo?: string;
  className?: string;
};

export function SignOutButton({
  redirectTo = "/",
  className = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50",
}: SignOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={signOut}
      className={className}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
