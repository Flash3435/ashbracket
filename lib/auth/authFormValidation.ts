/** Client-side email shape check (does not verify the account exists). */
export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function mapPasswordResetEmailError(message: string): string | null {
  const mapped = mapForgotPasswordRequestError(message);
  return mapped !== message ? mapped : null;
}

export function mapForgotPasswordRequestError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid") && m.includes("email")) {
    return "Enter a valid email address.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many requests. Wait a few minutes and try again.";
  }
  if (
    m.includes("redirect") ||
    (m.includes("url") && (m.includes("allow") || m.includes("valid")))
  ) {
    return "Password reset is temporarily unavailable. Please try again later or contact support.";
  }
  return message;
}

export const RESET_LINK_EXPIRED_MESSAGE =
  "This reset link has expired. Request a new one from the forgot-password page.";

export const RESET_LINK_INVALID_MESSAGE =
  "This reset link is invalid. Request a new one from the forgot-password page.";

export const RESET_LINK_MISSING_MESSAGE =
  "No reset session was found. Open the link from your email, or request a new reset link.";

export const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match.";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Your password has been updated. You can sign in with your new password.";

/** Supabase Auth error query params on the reset-password landing URL. */
export function mapResetLinkAuthParams(params: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): string | null {
  const code = params.errorCode?.trim().toLowerCase();
  if (code === "otp_expired") {
    return RESET_LINK_EXPIRED_MESSAGE;
  }
  if (code === "otp_disabled" || code === "validation_failed") {
    return RESET_LINK_INVALID_MESSAGE;
  }

  const authError = params.error?.trim().toLowerCase();
  if (authError === "access_denied") {
    const description = params.errorDescription?.replace(/\+/g, " ").toLowerCase() ?? "";
    if (description.includes("expired")) {
      return RESET_LINK_EXPIRED_MESSAGE;
    }
    return RESET_LINK_INVALID_MESSAGE;
  }

  if (params.error || params.errorCode) {
    const description = params.errorDescription?.replace(/\+/g, " ");
    if (description) return description;
    return RESET_LINK_INVALID_MESSAGE;
  }

  return null;
}

export function mapResetLinkExchangeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("otp_expired")) {
    return RESET_LINK_EXPIRED_MESSAGE;
  }
  if (
    m.includes("invalid") ||
    m.includes("malformed") ||
    m.includes("code verifier") ||
    m.includes("pkce")
  ) {
    return RESET_LINK_INVALID_MESSAGE;
  }
  if (m.includes("session") || m.includes("jwt") || m.includes("auth session")) {
    return RESET_LINK_MISSING_MESSAGE;
  }
  return RESET_LINK_INVALID_MESSAGE;
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
  if (m.includes("expired") || m.includes("otp_expired")) {
    return RESET_LINK_EXPIRED_MESSAGE;
  }
  if (m.includes("session") || m.includes("jwt")) {
    return RESET_LINK_MISSING_MESSAGE;
  }
  return message;
}
