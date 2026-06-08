/** Normalizes join code for storage (uppercase trim). */
export function normalizeJoinCodeInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Validates admin-provided join code before RPC. Empty means "generate server-side".
 */
export function validateJoinCodeFormat(
  raw: string | null | undefined,
): { ok: true; normalized: string | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === "") {
    return { ok: true, normalized: null };
  }
  const code = normalizeJoinCodeInput(raw);
  if (code.length < 3 || code.length > 40) {
    return {
      ok: false,
      error: "Join code must be between 3 and 40 characters.",
    };
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return {
      ok: false,
      error:
        "Join code may only contain letters, digits, hyphens, and underscores.",
    };
  }
  return { ok: true, normalized: code };
}
