import { getSiteUrl } from "@/lib/site-url";
import { safeRedirectPath } from "@/lib/auth/safeRedirectPath";

export const PASSWORD_RESET_PATH = "/reset-password";

/**
 * Absolute `redirect_to` for Supabase recovery emails (PKCE).
 * Uses `/auth/confirm` + `next` — same pattern as signup (`buildEmailConfirmRedirectUrl`).
 * GoTrue embeds this in the verify link; after exchange, the user lands on `/reset-password`.
 */
export function buildPasswordResetRedirectUrl(): string {
  const base = getSiteUrl().replace(/\/$/, "");
  const next = safeRedirectPath(PASSWORD_RESET_PATH, PASSWORD_RESET_PATH);
  const u = new URL("/auth/confirm", `${base}/`);
  u.searchParams.set("next", next);
  return u.toString();
}

/** Client bundle: build redirect from `NEXT_PUBLIC_SITE_URL` (inlined at build time on Vercel). */
export function buildPasswordResetRedirectUrlForClient(): string {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl) {
    const base = publicUrl.replace(/\/$/, "");
    const u = new URL("/auth/confirm", `${base}/`);
    u.searchParams.set("next", PASSWORD_RESET_PATH);
    return u.toString();
  }
  if (process.env.NODE_ENV === "development") {
    const u = new URL("/auth/confirm", "http://localhost:3000/");
    u.searchParams.set("next", PASSWORD_RESET_PATH);
    return u.toString();
  }
  return buildPasswordResetRedirectUrl();
}

/** Ensures we never send only the site origin (Supabase would land users on `/`). */
export function assertPasswordResetRedirectUrl(redirectTo: string): void {
  let parsed: URL;
  try {
    parsed = new URL(redirectTo);
  } catch {
    throw new Error(`Invalid password reset redirect URL: ${redirectTo}`);
  }

  if (parsed.pathname !== "/auth/confirm") {
    throw new Error(
      `Password reset redirect must use /auth/confirm, got: ${parsed.pathname}`,
    );
  }

  const next = parsed.searchParams.get("next");
  if (next !== PASSWORD_RESET_PATH) {
    throw new Error(
      `Password reset redirect must include next=${PASSWORD_RESET_PATH}, got: ${next ?? "(missing)"}`,
    );
  }

  const originOnly = `${parsed.protocol}//${parsed.host}`;
  if (redirectTo.replace(/\/$/, "") === originOnly.replace(/\/$/, "")) {
    throw new Error("Password reset redirect must not be origin-only");
  }
}

export function logPasswordResetRedirect(redirectTo: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info("[auth] password reset redirectTo:", redirectTo);
  }
}
