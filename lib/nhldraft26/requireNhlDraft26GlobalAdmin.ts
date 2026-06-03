import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function requireNhlDraft26GlobalAdminPage(
  nextPath = "/nhldraft26/admin",
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/nhldraft26/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!(await isGlobalAdmin(supabase))) {
    redirect("/nhldraft26/picks");
  }
}
