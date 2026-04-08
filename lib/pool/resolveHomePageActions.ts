import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessAdminDashboard } from "../auth/permissions";

export type HomePrimaryCta = {
  href: string;
  label: string;
};

export type HomePoolCard = {
  href: string;
  title: string;
  description: string;
};

export type HomePageActions = {
  primaryCta: HomePrimaryCta;
  poolCard: HomePoolCard;
};

const joinCard: HomePoolCard = {
  href: "/join",
  title: "Join the pool",
  description:
    "Create an account, enter your join code, and link your leaderboard name.",
};

/**
 * Hero button and second promo card: admins and current-pool participants see
 * paths that match their role; others see join.
 */
export async function resolveHomePageActions(
  supabase: SupabaseClient,
  homePoolId: string,
): Promise<HomePageActions> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      primaryCta: { href: "/join", label: "Join the Pool" },
      poolCard: joinCard,
    };
  }

  if (await canAccessAdminDashboard(supabase, user.id)) {
    return {
      primaryCta: { href: "/admin", label: "Go to Admin" },
      poolCard: {
        href: "/admin",
        title: "Manage the pool",
        description:
          "Participants, payments, picks, results, and tournament data.",
      },
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
      poolCard: {
        href: "/account",
        title: "Your account",
        description:
          "View your pool profile, picks, and public leaderboard link.",
      },
    };
  }

  return {
    primaryCta: { href: "/join", label: "Join the Pool" },
    poolCard: joinCard,
  };
}
