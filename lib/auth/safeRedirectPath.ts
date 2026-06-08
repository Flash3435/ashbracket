const DEFAULT_ADMIN_PATH = "/admin";

/**
 * Avoid open redirects: only same-origin paths starting with a single "/".
 * Use `defaultPath` for participants (e.g. `/account`) vs organizers (`/admin`).
 */
export function safeRedirectPath(
  next: string | undefined,
  defaultPath: string = DEFAULT_ADMIN_PATH,
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return defaultPath;
  }
  return next;
}
