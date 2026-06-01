"use server";

import {
  assertPasswordResetRedirectUrl,
  buildPasswordResetRedirectUrl,
  logPasswordResetRedirect,
} from "@/lib/auth/passwordResetRedirect";
import { isValidEmailFormat } from "@/lib/auth/authFormValidation";

export type RequestPasswordResetResult =
  | { ok: true; redirectTo: string; debugRedirectTo?: string }
  | { ok: false; error: string };

/**
 * Validates email and returns the canonical `redirectTo` for `resetPasswordForEmail`.
 * Prefer `POST /api/auth/forgot-password` so the recover call runs with request cookies.
 */
export async function requestPasswordReset(
  email: string,
): Promise<RequestPasswordResetResult> {
  const trimmed = email.trim();
  if (!isValidEmailFormat(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const redirectTo = buildPasswordResetRedirectUrl();
  assertPasswordResetRedirectUrl(redirectTo);
  logPasswordResetRedirect(redirectTo);

  return {
    redirectTo,
    ...(process.env.NODE_ENV === "development"
      ? { debugRedirectTo: redirectTo }
      : {}),
  };
}
