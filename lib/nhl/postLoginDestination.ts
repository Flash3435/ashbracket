import type { PostLoginDestination } from "@/lib/auth/postLoginDestination";
import { canAccessAdminDashboard } from "@/lib/auth/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

const NHL_LOGIN_LOOP = new Set(["/nhl/login", "/nhl/login/continue"]);

function pathnameOnly(pathWithQuery: string): string {
  const i = pathWithQuery.indexOf("?");
  return i === -1 ? pathWithQuery : pathWithQuery.slice(0, i);
}

/**
 * Honors `next` only when it stays under `/nhl/*` (or `/nhl`).
 * Blocks `/nhl/admin` destinations for users without global admin access.
 */
function sanitizeNhlRequestedNext(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  const pathOnly = pathnameOnly(raw);
  if (NHL_LOGIN_LOOP.has(pathOnly)) {
    return null;
  }
  if (pathOnly === "/") {
    return null;
  }
  if (pathOnly === "/nhl" || pathOnly.startsWith("/nhl/")) {
    return raw;
  }
  return null;
}

export async function resolveNhlPostLoginDestination(
  supabase: SupabaseClient,
  userId: string,
  requestedNextRaw: string | undefined,
): Promise<PostLoginDestination> {
  const canAdmin = await canAccessAdminDashboard(supabase, userId);
  const safeNext = sanitizeNhlRequestedNext(requestedNextRaw);
  if (safeNext) {
    const path = pathnameOnly(safeNext);
    const wantsNhlAdmin =
      path === "/nhl/admin" || path.startsWith("/nhl/admin/");
    if (wantsNhlAdmin && !canAdmin) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return { kind: "blocked_admin", email: user?.email ?? null };
    }
    return { kind: "redirect", path: safeNext };
  }
  return { kind: "redirect", path: "/nhl/account" };
}
