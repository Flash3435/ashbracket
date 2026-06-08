import type { PostLoginDestination } from "@/lib/auth/postLoginDestination";
import { canAccessAdminDashboard } from "@/lib/auth/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOGIN_LOOP = new Set([
  "/nhldraft26/login",
  "/nhldraft26/login/continue",
]);

function pathnameOnly(pathWithQuery: string): string {
  const i = pathWithQuery.indexOf("?");
  return i === -1 ? pathWithQuery : pathWithQuery.slice(0, i);
}

function sanitizeNhlDraft26RequestedNext(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  const pathOnly = pathnameOnly(raw);
  if (LOGIN_LOOP.has(pathOnly)) {
    return null;
  }
  if (pathOnly === "/") {
    return null;
  }
  if (pathOnly === "/nhldraft26" || pathOnly.startsWith("/nhldraft26/")) {
    return raw;
  }
  return null;
}

export async function resolveNhlDraft26PostLoginDestination(
  supabase: SupabaseClient,
  userId: string,
  requestedNextRaw: string | undefined,
): Promise<PostLoginDestination> {
  const canAdmin = await canAccessAdminDashboard(supabase, userId);
  const safeNext = sanitizeNhlDraft26RequestedNext(requestedNextRaw);
  if (safeNext) {
    const path = pathnameOnly(safeNext);
    const wantsAdmin =
      path === "/nhldraft26/admin" || path.startsWith("/nhldraft26/admin/");
    if (wantsAdmin && !canAdmin) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return { kind: "blocked_admin", email: user?.email ?? null };
    }
    return { kind: "redirect", path: safeNext };
  }
  return { kind: "redirect", path: "/nhldraft26/picks" };
}
