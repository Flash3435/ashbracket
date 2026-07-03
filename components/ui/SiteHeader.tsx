import { createClient } from "@/lib/supabase/server";
import { canAccessAdminDashboard } from "../../lib/auth/permissions";
import { loadSiteHeaderLeaderboardNav } from "../../lib/account/loadSiteHeaderLeaderboardNav";
import { SiteHeaderClient } from "./SiteHeaderClient";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user
    ? await canAccessAdminDashboard(supabase, user.id)
    : false;

  let showLeaderboardNav = false;
  let leaderboardHref: string | null = null;
  let standingsNavLabel: "Leaderboard" | "Outlook" | null = null;
  if (user) {
    const leaderboardNav = await loadSiteHeaderLeaderboardNav(user.id);
    showLeaderboardNav = leaderboardNav.showLeaderboardNav;
    leaderboardHref = leaderboardNav.leaderboardHref;
    standingsNavLabel = leaderboardNav.standingsNavLabel;
  }

  return (
    <SiteHeaderClient
      isSignedIn={!!user}
      isAdmin={isAdmin}
      showLeaderboardNav={showLeaderboardNav}
      leaderboardHref={leaderboardHref}
      standingsNavLabel={standingsNavLabel}
      showCreatePoolNav={!!user && !isAdmin}
    />
  );
}
