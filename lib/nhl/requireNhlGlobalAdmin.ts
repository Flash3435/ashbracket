import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

/**
 * NHL admin routes: same privilege as World Cup tournament admin (global `app_admins` only).
 */
export async function requireNhlGlobalAdminPage(
  nextPath = "/nhl/admin",
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/nhl/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!(await isGlobalAdmin(supabase))) {
    redirect("/nhl/account");
  }
}
