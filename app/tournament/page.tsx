import Link from "next/link";
import { TournamentProgressView } from "@/components/tournament/TournamentProgressView";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { loadAccountKnockoutSelection } from "../../lib/account/loadAccountKnockoutSelection";
import { resolveAccountParticipantId } from "../../lib/account/resolveAccountParticipantId";
import { fetchPublicTournamentProgress } from "../../lib/tournament/fetchPublicTournamentProgress";
import { OFFICIAL_EDITION_CODE } from "../../lib/config/officialTournament";
import { createClient } from "@/lib/supabase/server";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";

export const dynamic = "force-dynamic";

export default async function TournamentProgressPage() {
  const { data, error } = await fetchPublicTournamentProgress();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let schedulePickContext: {
    slots: KnockoutPickSlotDraft[];
    teams: Team[];
  } | null = null;

  if (user) {
    const { data: partRows } = await supabase
      .from("participants")
      .select("id, pool_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const profiles = partRows ?? [];
    const participantId = resolveAccountParticipantId(profiles, undefined);

    if (participantId) {
      const ctx = await loadAccountKnockoutSelection(user.id, participantId);
      if (!ctx.loadError && ctx.initialSlots.length > 0) {
        schedulePickContext = {
          slots: ctx.initialSlots,
          teams: ctx.teams,
        };
      }
    }
  }

  return (
    <PageContainer>
      <PageTitle
        title="Tournament progress"
        description={
          schedulePickContext
            ? "Official schedule and scores. When you are signed in, teams from your saved bracket are highlighted — no one else can see your picks."
            : "Official schedule and scores from the database. Sign in to highlight teams from your bracket on this page."
        }
      />

      {error ? (
        <div
          className="mb-6 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          <p className="font-medium text-red-100">Could not load tournament data</p>
          <p className="mt-1 text-red-200">{error}</p>
          <p className="mt-2 text-xs text-red-200/90">
            If you are hosting this app, apply the latest Supabase migration (views{" "}
            <code className="rounded bg-red-950/80 px-1 text-red-100">tournament_editions_public</code>,{" "}
            <code className="rounded bg-red-950/80 px-1 text-red-100">tournament_public_matches</code>
            ) so anonymous readers can load official rows safely.
          </p>
        </div>
      ) : null}

      {!error && data && !data.edition && data.matches.length === 0 ? (
        <div className="mb-6 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium text-amber-100">No official tournament yet</p>
          <p className="mt-1 text-amber-100/90">
            There is no edition with code{" "}
            <code className="rounded bg-amber-950/60 px-1 text-xs text-amber-100">
              {OFFICIAL_EDITION_CODE}
            </code>{" "}
            and no public match rows. Seed the World Cup schedule from the organizer
            tooling when you are ready.
          </p>
        </div>
      ) : null}

      {!error && data && (data.edition || data.matches.length > 0) ? (
        <TournamentProgressView
          payload={data}
          schedulePickContext={schedulePickContext}
        />
      ) : null}

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/" className="ash-link">
          Home
        </Link>
        {" · "}
        <Link href="/rules" className="ash-link">
          Rules
        </Link>
      </p>
    </PageContainer>
  );
}
