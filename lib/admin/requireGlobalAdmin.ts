import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../auth/permissions";
import { redirect } from "next/navigation";

/**
 * Shared tournament / official results admin: global admins only.
 */
export async function requireGlobalAdminPage(nextPath = "/admin"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }
}
