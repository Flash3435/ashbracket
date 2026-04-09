import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessAdminDashboard } from "./permissions";

const LOGIN_LOOP_PATHS = new Set(["/login", "/login/continue"]);

export type PostLoginDestination =
  | { kind: "redirect"; path: string }
  | { kind: "blocked_admin"; email: string | null };

function pathnameOnly(pathWithQuery: string): string {
  const i = pathWithQuery.indexOf("?");
  return i === -1 ? pathWithQuery : pathWithQuery.slice(0, i);
}

function sanitizeRequestedNext(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  const pathOnly = pathnameOnly(raw);
  if (LOGIN_LOOP_PATHS.has(pathOnly)) {
    return null;
  }
  // Marketing homepage is not a useful post-auth destination; use default account/admin landing.
  if (pathOnly === "/") {
    return null;
  }
  return raw;
}

/**
 * After authentication, pick where to send the user. Honors `next` when safe
 * and allowed (including admin paths only for users who can access admin).
 */
export async function resolvePostLoginDestination(
  supabase: SupabaseClient,
  userId: string,
  requestedNextRaw: string | undefined,
): Promise<PostLoginDestination> {
  const canAdmin = await canAccessAdminDashboard(supabase, userId);

  const { data: partRows, error: partErr } = await supabase
    .from("participants")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (partErr) {
    console.error("[resolvePostLoginDestination] participants", partErr.message);
  }
  const isParticipant = (partRows?.length ?? 0) > 0;

  const safeNext = sanitizeRequestedNext(requestedNextRaw);
  if (safeNext) {
    const path = pathnameOnly(safeNext);
    const wantsAdmin =
      path === "/admin" || path.startsWith("/admin/");
    if (wantsAdmin && !canAdmin) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return { kind: "blocked_admin", email: user?.email ?? null };
    }
    return { kind: "redirect", path: safeNext };
  }

  if (canAdmin && !isParticipant) {
    return { kind: "redirect", path: "/admin" };
  }
  return { kind: "redirect", path: "/account" };
}
