import { NhlDraft26CommunityLeaderboard } from "@/components/nhldraft26/NhlDraft26CommunityLeaderboard";
import { PageContainer } from "@/components/ui/PageContainer";
import { buildNhlDraft26ConsensusBoard } from "@/lib/nhldraft26/leaderboard/consensus";
import {
  fetchNhlDraft26PublicLeaderboardData,
  hasNhlDraft26PublishedResults,
} from "@/lib/nhldraft26/leaderboard/queries";
import { getNhlDraft26Top10PickSlots } from "@/lib/nhldraft26/draftOrder";
import { buildNhlDraft26ProspectMap } from "@/lib/nhldraft26/prospects";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Community Draft Board",
  description:
    "See community top-10 predictions and consensus rankings before the 2026 NHL Draft.",
};

export const dynamic = "force-dynamic";

export default async function NhlDraft26LeaderboardPage() {
  const supabase = await createClient();
  const hasResults = hasNhlDraft26PublishedResults();

  if (hasResults) {
    return (
      <PageContainer compactBottom>
        <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-8 sm:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-ash-text">Leaderboard</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
            Standings will appear here once scoring is enabled for published draft results.
          </p>
        </section>
      </PageContainer>
    );
  }

  const { data, error } = await fetchNhlDraft26PublicLeaderboardData(supabase);
  const prospectById = buildNhlDraft26ProspectMap();
  const pickSlots = getNhlDraft26Top10PickSlots();
  const consensusBoard = buildNhlDraft26ConsensusBoard(data.picks, prospectById);

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-ash-text">Community Draft Board</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          See how everyone is predicting the top 10 before draft night. Standings will appear here
          after the real results are entered.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/nhldraft26/picks" className="btn-primary no-underline">
            Make my picks
          </Link>
          <Link
            href="/nhldraft26/picks?quick=consensus"
            className="btn-ghost border-amber-500/25 no-underline"
          >
            Start with consensus top 10
          </Link>
          <Link href="/nhldraft26/rules" className="btn-ghost border-amber-500/25 no-underline">
            Rules
          </Link>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Could not load community board ({error}). Try again later.
        </p>
      ) : null}

      <NhlDraft26CommunityLeaderboard
        board={consensusBoard}
        entries={data.entries}
        prospectById={prospectById}
        pickSlots={pickSlots}
      />
    </PageContainer>
  );
}
