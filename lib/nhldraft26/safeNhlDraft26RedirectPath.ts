/** Open-redirect guard for NHL Draft 2026 post-auth flows. */
export function safeNhlDraft26RedirectPath(
  next: string | undefined,
  defaultPath: string = "/nhldraft26/picks",
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return defaultPath;
  }
  if (next === "/nhldraft26" || next.startsWith("/nhldraft26/")) {
    return next;
  }
  return defaultPath;
}
