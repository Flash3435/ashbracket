import { AdminResultsR32StatusSummary } from "@/components/admin/AdminResultsR32StatusSummary";
import { ApplyOfficialRoundOf32Panel } from "@/components/admin/ApplyOfficialRoundOf32Panel";
import { KnockoutResultsEditor } from "@/components/admin/KnockoutResultsEditor";
import { RecomputeAllPoolsPanel } from "@/components/admin/RecomputeAllPoolsPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  getOfficialR32ReadinessSummary,
  type OfficialR32ReadinessSummary,
} from "@/lib/admin/officialRoundOf32Readiness";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { createClient } from "@/lib/supabase/server";
import { ALL_BRACKET_PICK_SECTIONS } from "@/lib/admin/knockoutResultsConfig";
import { fetchGroupTeamCountryCodesByLetter } from "@/lib/tournament/fetchGroupTeamCountryCodesByLetter";
import {
  mapResultRow,
  mapTeamRow,
  mapTournamentStageRow,
} from "@/lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "@/lib/teams/teamDbSelect";
import type { Result, Team, TournamentStage } from "../../../../src/types/domain";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = Array.from(
  new Set(ALL_BRACKET_PICK_SECTIONS.map((s) => s.stageCode)),
);
const RESULT_KINDS = Array.from(
  new Set(ALL_BRACKET_PICK_SECTIONS.map((s) => s.kind)),
);

export default async function AdminResultsPage() {
  await requireGlobalAdminPage("/admin/results");

  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let results: Result[] = [];
  let loadError: string | null = null;
  let r32Summary: OfficialR32ReadinessSummary = {
    groupsComplete: 0,
    thirdPlaceQualifiersEntered: 0,
    officialR32Resolvable: false,
    resolvableHint: null,
  };

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
        .in("code", STAGE_CODES_NEEDED)
        .order("sort_order", { ascending: true }),
      supabase
        .from("results")
        .select(
          "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at",
        )
        .in("kind", RESULT_KINDS),
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

    if (!loadError && teams.length > 0) {
      const groupStage = stages.find((s) => s.code === "group");
      const r32Stage = stages.find((s) => s.code === "round_of_32");
      const groupMap = await fetchGroupTeamCountryCodesByLetter(supabase);
      r32Summary = getOfficialR32ReadinessSummary({
        results,
        groupStageId: groupStage?.id ?? null,
        roundOf32StageId: r32Stage?.id ?? null,
        teams,
        groupTeamCountryCodesByLetter: groupMap,
      });
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load results editor data.";
  }

  const stageByCode = Object.fromEntries(stages.map((s) => [s.code, s])) as Record<
    string,
    TournamentStage | undefined
  >;

  return (
    <PageContainer>
      <PageTitle
        title="Tournament results"
        description="Enter official group 1st/2nd, eight third-place advancers, and either use “Apply FIFA Round of 32” (Annex C) or set all 32 bracket slots manually. When every Round of 32 slot has a team, participant Stage 3 picks unlock. Scoring follows pool rules (including Stage 1–2 rules from settings). Saves refresh all pool leaderboards."
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      {!loadError && teams.length > 0 ? <AdminResultsR32StatusSummary summary={r32Summary} /> : null}
      <div className="mb-8">
        <RecomputeAllPoolsPanel />
      </div>
      {!loadError && teams.length > 0 ? <ApplyOfficialRoundOf32Panel /> : null}
      {!loadError && teams.length === 0 ? (
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          No teams found. Ask your site host to load the team list before you
          enter results.
        </p>
      ) : null}
      <KnockoutResultsEditor
        sections={ALL_BRACKET_PICK_SECTIONS}
        teams={teams}
        stageByCode={stageByCode}
        initialResults={results}
        disabled={Boolean(loadError) || teams.length === 0}
      />
    </PageContainer>
  );
}
