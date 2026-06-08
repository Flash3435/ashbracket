/**
 * Open-redirect guard for NHL post-auth flows: only same-origin paths under `/nhl`.
 */
export function safeNhlRedirectPath(
  next: string | undefined,
  defaultPath: string = "/nhl/account",
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return defaultPath;
  }
  if (next === "/nhl" || next.startsWith("/nhl/")) {
    return next;
  }
  return defaultPath;
}
