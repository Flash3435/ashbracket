import { createClient } from "@/lib/supabase/server";
import { canAccessAdminDashboard } from "../../lib/auth/permissions";
import { SiteHeaderClient } from "./SiteHeaderClient";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user
    ? await canAccessAdminDashboard(supabase, user.id)
    : false;

  let showActivityNav = false;
  if (user) {
    const { count, error } = await supabase
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    showActivityNav = !error && (count ?? 0) > 0;
  }

  return (
    <SiteHeaderClient
      isSignedIn={!!user}
      isAdmin={isAdmin}
      showActivityNav={showActivityNav}
    />
  );
}
