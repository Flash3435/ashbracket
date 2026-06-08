"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Supabase may fall back to Site URL (`/`) when `redirect_to` is not allow-listed.
 * Forward recovery callbacks to `/reset-password` with the same query string.
 */
export function AuthRecoveryRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    const hasAuthError = searchParams.get("error") || searchParams.get("error_code");
    if (!code && !hasAuthError && type !== "recovery") return;

    const qs = searchParams.toString();
    router.replace(qs ? `/reset-password?${qs}` : "/reset-password");
  }, [router, searchParams]);

  return null;
}
