import { getSiteUrl } from "@/lib/site-url";

export const PASSWORD_RESET_PATH = "/reset-password";

/**
 * Absolute `redirect_to` for Supabase recovery emails (PKCE).
 * GoTrue embeds this in the verify link; after exchange, the user lands on `/reset-password`.
 */
export function buildPasswordResetRedirectUrl(): string {
  return `${getSiteUrl().replace(/\/$/, "")}${PASSWORD_RESET_PATH}`;
}

/** Client bundle: build redirect from `NEXT_PUBLIC_SITE_URL` (inlined at build time on Vercel). */
export function buildPasswordResetRedirectUrlForClient(): string {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}${PASSWORD_RESET_PATH}`;
  }
  if (process.env.NODE_ENV === "development") {
    return `http://localhost:3000${PASSWORD_RESET_PATH}`;
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

  if (parsed.pathname !== PASSWORD_RESET_PATH) {
    throw new Error(
      `Password reset redirect must use ${PASSWORD_RESET_PATH}, got: ${parsed.pathname}`,
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
