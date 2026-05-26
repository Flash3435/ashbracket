import { AdminResultsR32StatusSummary } from "@/components/admin/AdminResultsR32StatusSummary";
import { ApplyOfficialRoundOf32Panel } from "@/components/admin/ApplyOfficialRoundOf32Panel";
import { KnockoutResultsEditor } from "@/components/admin/KnockoutResultsEditor";
import { RecomputeAllPoolsPanel } from "@/components/admin/RecomputeAllPoolsPanel";
import { SimulationResultsGeneratorPanel } from "@/components/admin/SimulationResultsGeneratorPanel";
import { SimulationEditionSyncPanel } from "@/components/admin/SimulationEditionSyncPanel";
import { SimulationModeBanner } from "@/components/admin/SimulationModeBanner";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { getOfficialR32ReadinessSummary } from "@/lib/admin/officialRoundOf32Readiness";
import { ALL_BRACKET_PICK_SECTIONS } from "@/lib/admin/knockoutResultsConfig";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { mapResultRow, mapTeamRow, mapTournamentStageRow } from "@/lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "@/lib/teams/teamDbSelect";
import { fetchGroupTeamCountryCodesForEdition } from "@/lib/tournament/fetchGroupTeamCountryCodesForEdition";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Result, Team, TournamentStage } from "../../../../../../../src/types/domain";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = Array.from(
  new Set(ALL_BRACKET_PICK_SECTIONS.map((s) => s.stageCode)),
);
const RESULT_KINDS = Array.from(
  new Set(ALL_BRACKET_PICK_SECTIONS.map((s) => s.kind)),
);

type PageProps = {
  params: Promise<{ editionId: string }>;
};

export default async function SimulationEditionResultsPage({ params }: PageProps) {
  await requireGlobalAdminPage("/admin/simulation");
  const { editionId } = await params;
  const supabase = await createClient();

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("id", editionId)
    .maybeSingle();

  if (edErr || !edition) {
    return (
      <PageContainer>
        <p className="text-sm text-red-200">Simulation edition not found.</p>
      </PageContainer>
    );
  }

  if (!edition.is_simulation) {
    return (
      <PageContainer>
        <p className="text-sm text-red-200">
          This edition is not marked simulation. Use{" "}
          <Link href="/admin/results" className="ash-link">
            live tournament results
          </Link>{" "}
          instead.
        </p>
      </PageContainer>
    );
  }

  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let results: Result[] = [];
  let loadError: string | null = null;
  let r32Summary = {
    groupsComplete: 0,
    thirdPlaceQualifiersEntered: 0,
    officialR32Resolvable: false,
    resolvableHint: null as string | null,
  };

  const [teamsRes, stagesRes, resultsRes] = await Promise.all([
    supabase.from("teams").select(TEAM_TABLE_SELECT).order("name", { ascending: true }),
    supabase
      .from("tournament_stages")
      .select("id, code, label, sort_order, starts_at, ends_at, created_at, updated_at")
      .in("code", STAGE_CODES_NEEDED)
      .order("sort_order", { ascending: true }),
    supabase
      .from("results")
      .select(
        "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
      )
      .eq("edition_id", editionId)
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

  if (!loadError && teams.length > 0) {
    const groupStage = stages.find((s) => s.code === "group");
    const r32Stage = stages.find((s) => s.code === "round_of_32");
    const groupMap = await fetchGroupTeamCountryCodesForEdition(supabase, editionId);
    r32Summary = getOfficialR32ReadinessSummary({
      results,
      groupStageId: groupStage?.id ?? null,
      roundOf32StageId: r32Stage?.id ?? null,
      teams,
      groupTeamCountryCodesByLetter: groupMap,
    });
  }

  const stageByCode = Object.fromEntries(stages.map((s) => [s.code, s])) as Record<
    string,
    TournamentStage | undefined
  >;

  const editionLabel = `${edition.name} (${edition.code})`;
  const isProduction = isProductionDeployment();
  const editionImpact = await fetchEditionImpactSummary(supabase, editionId);

  return (
    <PageContainer>
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/simulation" className="ash-link">
          Simulation testing
        </Link>
      </p>

      <PageTitle
        title="Simulation results"
        description="Fake tournament outcomes for test pools only. Saves recompute simulation pool leaderboards — live pools are untouched."
      />

      <SimulationModeBanner variant="simulation" editionLabel={editionLabel} className="mb-6" />

      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}

      <SimulationResultsGeneratorPanel
        editionId={editionId}
        isProduction={isProduction}
      />

      {editionImpact ? (
        <div className="mb-6">
          <SimulationEditionSyncPanel
            isProduction={isProduction}
            impact={editionImpact}
            editionCode={edition.code as string}
          />
        </div>
      ) : null}

      {!loadError && teams.length > 0 ? (
        <AdminResultsR32StatusSummary summary={r32Summary} />
      ) : null}

      {editionImpact ? (
        <div className="mb-8">
          <RecomputeAllPoolsPanel
            isProduction={isProduction}
            impact={editionImpact}
            editionId={editionId}
            title="Recalculate simulation pool leaderboards"
            description="Runs scoring for every pool tied to this simulation edition."
            buttonLabel="Recalculate simulation pools"
            successMessage="Simulation pool leaderboards updated."
          />
        </div>
      ) : null}

      {!loadError && teams.length > 0 ? (
        <ApplyOfficialRoundOf32Panel editionId={editionId} />
      ) : null}

      {teams.length > 0 ? (
        <KnockoutResultsEditor
          editionId={editionId}
          sections={ALL_BRACKET_PICK_SECTIONS}
          teams={teams}
          stageByCode={stageByCode}
          initialResults={results}
          disabled={Boolean(loadError)}
          isSimulation
          isProduction={isProduction}
        />
      ) : null}
    </PageContainer>
  );
}
