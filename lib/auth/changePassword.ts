import {
  mapPasswordUpdateError,
  PASSWORD_MISMATCH_MESSAGE,
} from "@/lib/auth/authFormValidation";

export const MIN_PASSWORD_LENGTH = 6;

export const CURRENT_PASSWORD_INCORRECT_MESSAGE =
  "Current password is incorrect.";

export const CHANGE_PASSWORD_SUCCESS_MESSAGE =
  "Your password has been updated.";

export const CHANGE_PASSWORD_NO_EMAIL_MESSAGE =
  "Your account does not have a password sign-in email. Use forgot password from the sign-in page if you need access help.";

export type ChangePasswordFieldInput = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type ChangePasswordValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateChangePasswordFields(
  input: ChangePasswordFieldInput,
): ChangePasswordValidationResult {
  if (!input.currentPassword) {
    return { ok: false, message: "Enter your current password." };
  }
  if (!input.newPassword.trim()) {
    return { ok: false, message: "Enter a new password." };
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`,
    };
  }
  if (input.newPassword !== input.confirmNewPassword) {
    return { ok: false, message: PASSWORD_MISMATCH_MESSAGE };
  }
  return { ok: true };
}

/** Map Supabase `signInWithPassword` errors during re-authentication. */
export function mapReauthSignInError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("invalid email or password")
  ) {
    return CURRENT_PASSWORD_INCORRECT_MESSAGE;
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return message;
}

export function mapChangePasswordUpdateError(message: string): string {
  return mapPasswordUpdateError(message);
}
