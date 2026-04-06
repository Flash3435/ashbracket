import { createClient } from "@/lib/supabase/server";
import { isAppAdmin } from "../../lib/auth/isAppAdmin";
import { SiteHeaderClient } from "./SiteHeaderClient";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? await isAppAdmin(supabase, user.id) : false;

  return (
    <SiteHeaderClient isSignedIn={!!user} isAdmin={isAdmin} />
  );
}
