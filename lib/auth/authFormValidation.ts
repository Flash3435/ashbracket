/** Client-side email shape check (does not verify the account exists). */
export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function mapForgotPasswordRequestError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid") && m.includes("email")) {
    return "Enter a valid email address.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many requests. Wait a few minutes and try again.";
  }
  return message;
}

export function mapPasswordUpdateError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("password") &&
    (m.includes("weak") ||
      m.includes("short") ||
      m.includes("at least") ||
      m.includes("characters") ||
      m.includes("length"))
  ) {
    return "Choose a stronger password (at least 6 characters).";
  }
  if (m.includes("session") || m.includes("expired") || m.includes("jwt")) {
    return "This reset link is invalid or has expired. Request a new one from the forgot-password page.";
  }
  return message;
}

export const RESET_LINK_INVALID_MESSAGE =
  "This reset link is invalid or has expired. Request a new reset email below.";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Your password has been updated. You can sign in with your new password.";
