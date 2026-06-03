export const NHL_DRAFT26_DISPLAY_NAME_MIN = 3;
export const NHL_DRAFT26_DISPLAY_NAME_MAX = 24;

export const NHL_DRAFT26_DISPLAY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _\-]*$/;

export const NHL_DRAFT26_DISPLAY_NAME_EMPTY_MESSAGE =
  "Enter a public leaderboard name (3–24 characters).";
export const NHL_DRAFT26_DISPLAY_NAME_TOO_SHORT_MESSAGE = `Public leaderboard name must be at least ${NHL_DRAFT26_DISPLAY_NAME_MIN} characters.`;
export const NHL_DRAFT26_DISPLAY_NAME_TOO_LONG_MESSAGE = `Public leaderboard name must be ${NHL_DRAFT26_DISPLAY_NAME_MAX} characters or fewer.`;
export const NHL_DRAFT26_DISPLAY_NAME_INVALID_CHARS_MESSAGE =
  "Use only letters, numbers, spaces, underscores, and hyphens.";

export function normalizeNhlDraft26DisplayName(raw: string): string {
  return raw.trim();
}

export function validateNhlDraft26DisplayName(
  raw: unknown,
): { ok: true; displayName: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: NHL_DRAFT26_DISPLAY_NAME_EMPTY_MESSAGE };
  }

  const displayName = normalizeNhlDraft26DisplayName(raw);
  if (displayName.length === 0) {
    return { ok: false, error: NHL_DRAFT26_DISPLAY_NAME_EMPTY_MESSAGE };
  }
  if (displayName.length < NHL_DRAFT26_DISPLAY_NAME_MIN) {
    return { ok: false, error: NHL_DRAFT26_DISPLAY_NAME_TOO_SHORT_MESSAGE };
  }
  if (displayName.length > NHL_DRAFT26_DISPLAY_NAME_MAX) {
    return { ok: false, error: NHL_DRAFT26_DISPLAY_NAME_TOO_LONG_MESSAGE };
  }
  if (!NHL_DRAFT26_DISPLAY_NAME_PATTERN.test(displayName)) {
    return { ok: false, error: NHL_DRAFT26_DISPLAY_NAME_INVALID_CHARS_MESSAGE };
  }

  return { ok: true, displayName };
}
