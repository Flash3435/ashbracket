import { KnockoutResultsEditor } from "@/components/admin/KnockoutResultsEditor";
import { RecomputeStandingsPanel } from "@/components/admin/RecomputeStandingsPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { KNOCKOUT_EDITOR_SECTIONS } from "../../../lib/admin/knockoutResultsConfig";
import {
  mapResultRow,
  mapTeamRow,
  mapTournamentStageRow,
} from "../../../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../../../lib/teams/teamDbSelect";
import type { Result, Team, TournamentStage } from "../../../src/types/domain";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = ["quarterfinal", "semifinal", "final"] as const;

export default async function AdminResultsPage() {
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let results: Result[] = [];
  let loadError: string | null = null;

  try {
    const supabase = await createClient();

    const [teamsRes, stagesRes, resultsRes] = await Promise.all([
      supabase
        .from("teams")
        .select(TEAM_TABLE_SELECT)
        .order("name", { ascending: true }),
      supabase
        .from("tournament_stages")
        .select(
          "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
        )
        .in("code", [...STAGE_CODES_NEEDED])
        .order("sort_order", { ascending: true }),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at",
        )
        .in("kind", [
          "quarterfinalist",
          "semifinalist",
          "finalist",
          "champion",
        ]),
    ]);

    if (teamsRes.error) loadError = teamsRes.error.message;
    else if (stagesRes.error) loadError = stagesRes.error.message;
    else if (resultsRes.error) loadError = resultsRes.error.message;
    else {
      teams = (teamsRes.data ?? []).map(mapTeamRow);
      stages = (stagesRes.data ?? []).map(mapTournamentStageRow);
      results = (resultsRes.data ?? []).map(mapResultRow);
    }

    if (!loadError) {
      for (const code of STAGE_CODES_NEEDED) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `A required tournament stage (“${code}”) is missing. Ask your site host to finish tournament setup.`;
          break;
        }
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load results editor data.";
  }

  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Record<(typeof STAGE_CODES_NEEDED)[number], TournamentStage | undefined>;

  return (
    <PageContainer>
      <PageTitle
        title="Tournament results"
        description="Enter the real outcomes by stage (quarterfinals through champion). Each save updates official results, recalculates everyone’s points, and refreshes the leaderboard."
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      <div className="mb-8">
        <RecomputeStandingsPanel />
      </div>
      {!loadError && teams.length === 0 ? (
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          No teams found. Ask your site host to load the team list before you
          enter results.
        </p>
      ) : null}
      <KnockoutResultsEditor
        sections={KNOCKOUT_EDITOR_SECTIONS}
        teams={teams}
        stageByCode={stageByCode}
        initialResults={results}
        disabled={Boolean(loadError) || teams.length === 0}
      />
    </PageContainer>
  );
}
