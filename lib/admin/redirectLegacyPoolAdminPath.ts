import { createClient } from "@/lib/supabase/server";
import { fetchManagedPoolsForCurrentUser } from "../pools/fetchManagedPoolsForViewer";
import { redirect } from "next/navigation";

/**
 * Preserve query strings (e.g. `?participant=`) when moving from legacy flat `/admin/...` URLs.
 */
export function serializeLegacyAdminQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  if (!searchParams) return "";
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) u.append(key, v);
    } else {
      u.set(key, value);
    }
  }
  const q = u.toString();
  return q ? `?${q}` : "";
}

/**
 * Old flat `/admin/...` URLs → `/admin/pools/[poolId]/...` when exactly one managed pool; otherwise pool chooser.
 */
export async function redirectLegacyPoolAdminPath(
  subpath: string,
  querySuffix = "",
): Promise<never> {
  const supabase = await createClient();
  const { data: pools, error } = await fetchManagedPoolsForCurrentUser(supabase);
  if (error) {
    redirect("/admin");
  }
  const list = pools ?? [];
  if (list.length === 1) {
    redirect(`/admin/pools/${list[0].id}${subpath}${querySuffix}`);
  }
  redirect("/admin");
}
