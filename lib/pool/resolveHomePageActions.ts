import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessAdminDashboard } from "../auth/permissions";

export type HomePrimaryCta = {
  href: string;
  label: string;
};

/**
 * Hero primary button: admins and current-pool participants see paths that match
 * their role; others see join.
 */
export async function resolveHomePageActions(
  supabase: SupabaseClient,
  homePoolId: string,
): Promise<{ primaryCta: HomePrimaryCta }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      primaryCta: { href: "/join", label: "Join the Pool" },
    };
  }

  if (await canAccessAdminDashboard(supabase, user.id)) {
    return {
      primaryCta: { href: "/admin", label: "Go to Admin" },
    };
  }

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id")
    .eq("user_id", user.id)
    .eq("pool_id", homePoolId)
    .limit(1);

  const participantId = !error ? rows?.[0]?.id : undefined;

  if (participantId) {
    return {
      primaryCta: {
        href: `/account/picks?participant=${participantId}`,
        label: "My picks",
      },
    };
  }

  return {
    primaryCta: { href: "/join", label: "Join the Pool" },
  };
}
