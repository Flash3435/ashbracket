import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidEmailFormat } from "@/lib/auth/authFormValidation";
import {
  assertPasswordResetRedirectUrl,
  buildPasswordResetRedirectUrl,
  logPasswordResetRedirect,
} from "@/lib/auth/passwordResetRedirect";

export type SendPasswordResetEmailResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Sends a Supabase recovery email with `redirect_to` → `/reset-password`.
 * Use AshBracket forgot-password or this helper — not Supabase Dashboard recovery.
 */
export async function sendPasswordResetEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<SendPasswordResetEmailResult> {
  const trimmed = email.trim();
  if (!isValidEmailFormat(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const redirectTo = buildPasswordResetRedirectUrl();
  try {
    assertPasswordResetRedirectUrl(redirectTo);
  } catch (e) {
    console.error("[sendPasswordResetEmail] invalid redirect URL:", e);
    return {
      ok: false,
      error: "Password reset is temporarily unavailable.",
    };
  }

  logPasswordResetRedirect(redirectTo);
  console.info("[sendPasswordResetEmail] resetPasswordForEmail redirectTo:", redirectTo);

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  });

  if (error) {
    console.error("[sendPasswordResetEmail] supabase error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, redirectTo };
}
