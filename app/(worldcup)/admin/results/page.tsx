import { AdminResultsR32StatusSummary } from "@/components/admin/AdminResultsR32StatusSummary";
import { AdminResultsAdvancedTools } from "@/components/admin/AdminResultsAdvancedTools";
import { ApplyOfficialRoundOf32Panel } from "@/components/admin/ApplyOfficialRoundOf32Panel";
import { KnockoutResultsEditor } from "@/components/admin/KnockoutResultsEditor";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  getOfficialR32ReadinessSummary,
  type OfficialR32ReadinessSummary,
} from "@/lib/admin/officialRoundOf32Readiness";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { fetchOfficialLiveEdition } from "@/lib/tournament/editionScope";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
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
  let liveEditionId: string | null = null;
  let liveEditionLabel: string | null = null;
  let r32Summary: OfficialR32ReadinessSummary = {
    groupsComplete: 0,
    thirdPlaceQualifiersEntered: 0,
    officialR32Resolvable: false,
    resolvableHint: null,
  };

  try {
    const supabase = await createClient();
    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      loadError =
        "Official live tournament edition is not installed. Run the WC2026 seed before entering results.";
    } else {
      liveEditionId = liveEdition.id;
      liveEditionLabel = `${liveEdition.name} (${liveEdition.code})`;
    }

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
      liveEditionId
        ? supabase
            .from("results")
            .select(
              "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
            )
            .eq("edition_id", liveEditionId)
            .in("kind", RESULT_KINDS)
        : Promise.resolve({ data: [], error: null }),
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

  const isProduction = isProductionDeployment();
  const supabaseForImpact = await createClient();
  const liveImpact =
    liveEditionId != null
      ? await fetchEditionImpactSummary(supabaseForImpact, liveEditionId)
      : null;

  return (
    <PageContainer>
      <PageTitle
        title="Tournament results (live)"
        description="Official live tournament only. During a production pilot, use Simulation → Test results for fake scores — do not enter pilot data here."
      />
      <SimulationModeBanner
        variant="live"
        editionLabel={liveEditionLabel ?? undefined}
        className="mb-6"
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      {!loadError && teams.length > 0 ? <AdminResultsR32StatusSummary summary={r32Summary} /> : null}
      <p className="mb-6 text-sm leading-relaxed text-ash-muted">
        This page edits official <span className="font-medium text-ash-text">bracket results</span>{" "}
        in the <code className="text-xs">results</code> table (group 1st/2nd, third-place
        qualifiers, knockout slots) — not individual match scores on{" "}
        <code className="text-xs">tournament_matches</code>. For the normal daily workflow,
        enter final scores on match rows first (see{" "}
        <Link href="/admin/tournament" className="ash-link">
          Live scores &amp; standings
        </Link>
        ), then run{" "}
        <Link href="/admin/tournament" className="ash-link">
          Update today&apos;s scores
        </Link>
        . Use the editors below only for manual corrections, locked overrides, or Round of 32
        setup — they may need the advanced recalculate option.
      </p>
      {liveEditionId && liveImpact ? (
        <AdminResultsAdvancedTools
          liveEditionId={liveEditionId}
          liveImpact={liveImpact}
        />
      ) : null}
      {!loadError && teams.length > 0 && liveEditionId ? (
        <ApplyOfficialRoundOf32Panel editionId={liveEditionId} />
      ) : null}
      {!loadError && teams.length === 0 ? (
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          No teams found. Ask your site host to load the team list before you
          enter results.
        </p>
      ) : null}
      {liveEditionId ? (
        <KnockoutResultsEditor
          editionId={liveEditionId}
          sections={ALL_BRACKET_PICK_SECTIONS}
          teams={teams}
          stageByCode={stageByCode}
          initialResults={results}
          disabled={Boolean(loadError) || teams.length === 0}
          isSimulation={false}
          isProduction={isProduction}
        />
      ) : null}
    </PageContainer>
  );
}
