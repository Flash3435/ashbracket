import { getSiteUrl } from "@/lib/site-url";
import { safeNhlRedirectPath } from "./safeNhlRedirectPath";

/**
 * Supabase `emailRedirectTo` for NHL sign-up: lands on `/auth/confirm` then `next` under `/nhl/*`.
 */
export function buildNhlEmailConfirmRedirectUrl(redirectAfterConfirm: string): string {
  const next = safeNhlRedirectPath(redirectAfterConfirm, "/nhl/account");
  const base = getSiteUrl();
  const u = new URL("/auth/confirm", `${base.replace(/\/$/, "")}/`);
  u.searchParams.set("next", next);
  return u.toString();
}
