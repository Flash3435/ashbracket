import { getSiteUrl } from "@/lib/site-url";
import { safeRedirectPath } from "./safeRedirectPath";

/**
 * Absolute URL Supabase puts in signup confirmation emails (`redirect_to`).
 * After verification, Supabase redirects here with `?code=…` (PKCE); the route
 * exchanges the code for a session and sends the user to `next` (invite-aware).
 */
export function buildEmailConfirmRedirectUrl(redirectAfterConfirm: string): string {
  const next = safeRedirectPath(redirectAfterConfirm, "/join");
  const base = getSiteUrl();
  const u = new URL("/auth/confirm", `${base.replace(/\/$/, "")}/`);
  u.searchParams.set("next", next);
  return u.toString();
}
