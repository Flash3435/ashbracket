/** Shown in admin UI when production cannot load trusted completion reads. */
export const ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE =
  "Admin completion check requires SUPABASE_SERVICE_ROLE_KEY in production.";

export function adminBuildCommitSha(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) return sha.slice(0, 7);
  return "unknown";
}

export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function getSupabaseProjectUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
    process.env.SUPABASE_URL?.trim() ??
    null;
  return url || null;
}

export function isServiceRoleKeyConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return key.length > 20;
}
