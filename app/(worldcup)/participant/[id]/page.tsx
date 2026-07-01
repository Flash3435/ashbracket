import { notFound } from "next/navigation";
import { PublicParticipantProfile } from "@/components/participant/PublicParticipantProfile";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchMemberPoolStandings } from "@/lib/leaderboard/fetchMemberPoolStandings";
import { buildViewerLeaderComparison } from "@/lib/leaderboard/buildViewerLeaderComparison";
import { mapPublicLeaderboardRow } from "@/lib/leaderboard/publicLeaderboard";
import { getMyParticipantIdInPool } from "@/lib/join/actions";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicParticipantDetail } from "../../../../lib/participant/fetchPublicParticipantDetail";
import type { LeaderboardPublicRow, LeaderboardPublicRowDb } from "../../../../types/leaderboard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PublicParticipantPage({ params }: PageProps) {
  const { id } = await params;
  const result = await fetchPublicParticipantDetail(id);

  if (!result.ok) {
    if (result.kind === "not_found") {
      notFound();
    }
    return (
      <PageContainer>
        <PageTitle
          title="Participant"
          description="Public profile and picks for this pool."
        />
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          Could not load this profile
          {result.message ? `: ${result.message}` : "."}
        </p>
      </PageContainer>
    );
  }

  const { data } = result;
  const supabase = await createClient();
  const viewerParticipantId = await getMyParticipantIdInPool(data.poolId);
  const isViewer =
    viewerParticipantId !== null && viewerParticipantId === data.participantId;

  let viewerLeaderComparison = null;
  if (isViewer && viewerParticipantId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let rows: LeaderboardPublicRow[] = [];
    if (user) {
      const { data: poolRow } = await supabase
        .from("pools")
        .select("is_public")
        .eq("id", data.poolId)
        .maybeSingle();

      if (poolRow?.is_public) {
        const { data: leaderboardRows } = await supabase
          .from("leaderboard_public")
          .select(
            "pool_id, pool_name, participant_id, display_name, total_points, rank",
          )
          .eq("pool_id", data.poolId)
          .order("rank", { ascending: true });
        rows = (leaderboardRows ?? []).map((row) =>
          mapPublicLeaderboardRow(row as LeaderboardPublicRowDb),
        );
      } else {
        const standings = await fetchMemberPoolStandings(data.poolId, user.id, {
          supabase,
        });
        rows = standings.ok ? standings.rows : [];
      }
    }

    viewerLeaderComparison = buildViewerLeaderComparison(
      rows,
      viewerParticipantId,
    );
  }

  return (
    <PageContainer>
      <PublicParticipantProfile
        detail={data}
        isViewer={isViewer}
        viewerLeaderComparison={viewerLeaderComparison}
      />
    </PageContainer>
  );
}
