"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { logPilotVerificationEvent } from "@/lib/admin/pilotVerificationLog";
import {
  fetchEditionImpactSummary,
  type AdminImpactSummary,
} from "@/lib/admin/fetchAdminImpactSummary";
import {
  generateSimulationBatchPreview,
  type SimulationBatchPreview,
  type SimulationDecisionType,
} from "@/lib/admin/simulationResultsGenerator";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { mapTeamRow } from "@/lib/results/mapRows";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import { TEAM_TABLE_SELECT } from "@/lib/teams/teamDbSelect";
import { poolIdsForEdition } from "@/lib/tournament/editionScope";
import { syncOfficialTournament } from "@/lib/tournament/syncOfficialTournament";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type BootstrapSimulationPoolResult =
  | { ok: true; poolId: string; editionId: string; editionCode: string }
  | { ok: false; error: string };

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

type SimulationEditionRow = {
  id: string;
  code: string;
  name: string;
  isSimulation: boolean;
};

export type SimulationPreviewMatch = {
  matchId: string;
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  kickoffAt: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  decisionType: SimulationDecisionType;
};

export type SimulationResultsPreview = {
  impact: AdminImpactSummary;
  batchType: SimulationBatchPreview["batchType"];
  batchLabel: string;
  batchKey: string;
  fallbackBatchSize: number | null;
  matchCount: number;
  stageMode: SimulationBatchPreview["stageMode"];
  stageCodes: string[];
  matches: SimulationPreviewMatch[];
};

export type PreviewSimulationResultsResult =
  | { ok: true; preview: SimulationResultsPreview }
  | { ok: false; error: string };

export type ApplySimulationResultsResult =
  | { ok: true; message: string; affectedPoolCount: number; matchCount: number }
  | { ok: false; error: string };

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeScore(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 20 ? value : null;
}

function describeSimulationPreview(preview: SimulationBatchPreview): string {
  return `${preview.batchType} ${preview.batchKey} stageMode=${preview.stageMode} stageCodes=${preview.stageCodes.join(",")}`;
}

function stageModeLine(preview: SimulationBatchPreview): string {
  switch (preview.stageMode) {
    case "group":
      return "Stage profile: group stage only. Draws are allowed and remain draws.";
    case "knockout":
      return "Stage profile: knockout only. Tied scores are resolved with penalties so every match has a winner.";
    default:
      return "Stage profile: mixed batch. Group matches may draw; knockout matches are resolved with penalties when level.";
  }
}

function buildSimulationImpactSummary(
  impact: AdminImpactSummary,
  preview: SimulationBatchPreview,
): AdminImpactSummary {
  const batchLine =
    preview.batchType === "kickoff_date"
      ? `Targets ${preview.matchCount} scheduled simulation match(es) on the earliest unplayed date in this edition (${preview.batchKey}).`
      : `Targets the first ${preview.matchCount} scheduled simulation match(es) in schedule order because kickoff dates were unavailable. Fallback batch size: ${preview.fallbackBatchSize ?? preview.matchCount}.`;

  return {
    ...impact,
    effectLines: [
      batchLine,
      stageModeLine(preview),
      `Writes fake scores to simulation edition “${impact.editionName}”, rebuilds derived result rows, and recalculates ${impact.poolCount} simulation pool(s) only.`,
      "Already finished, live, locked, or team-less matches are excluded. Live editions, live pools, and live standings are not touched.",
    ],
  };
}

async function requireGlobalSimulationEdition(
  supabase: SupabaseServer,
  editionId: string,
): Promise<
  | { ok: true; user: { id: string; email: string | null | undefined }; edition: SimulationEditionRow }
  | { ok: false; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return {
      ok: false,
      error: "Only global administrators can generate simulation results.",
    };
  }

  const { data: edition, error } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("id", editionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!edition) return { ok: false, error: "Simulation edition not found." };
  if (!edition.is_simulation) {
    return {
      ok: false,
      error: "Refusing to generate fake results for a live edition.",
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
    },
    edition: {
      id: edition.id as string,
      code: edition.code as string,
      name: edition.name as string,
      isSimulation: Boolean(edition.is_simulation),
    },
  };
}

async function loadSimulationPreviewBundle(
  supabase: SupabaseServer,
  edition: SimulationEditionRow,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      preview: SimulationBatchPreview;
      impact: AdminImpactSummary;
      affectedPoolCount: number;
    }
> {
  const impact = await fetchEditionImpactSummary(supabase, edition.id);
  if (!impact) {
    return { ok: false, error: "Could not load simulation edition impact summary." };
  }

  const { data: matchRows, error: matchError } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, group_code, kickoff_at, status, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, sync_locked",
    )
    .eq("edition_id", edition.id)
    .eq("status", "scheduled");

  if (matchError) {
    return { ok: false, error: matchError.message };
  }

  const eligibleMatches = (matchRows ?? []).filter((row) => {
    if (!row.home_team_id || !row.away_team_id) return false;
    if (row.sync_locked) return false;
    return (
      row.home_goals == null &&
      row.away_goals == null &&
      row.home_penalties == null &&
      row.away_penalties == null &&
      row.winner_team_id == null
    );
  });

  if (eligibleMatches.length === 0) {
    return {
      ok: false,
      error:
        "No eligible scheduled simulation matches are available. Finished, locked, live, or unresolved matches are excluded.",
    };
  }

  const teamIds = [
    ...new Set(
      eligibleMatches.flatMap((row) => [
        row.home_team_id as string,
        row.away_team_id as string,
      ]),
    ),
  ];

  const { data: teamRows, error: teamError } = await supabase
    .from("teams")
    .select(TEAM_TABLE_SELECT)
    .in("id", teamIds)
    .order("name", { ascending: true });

  if (teamError) {
    return { ok: false, error: teamError.message };
  }

  const teams = (teamRows ?? []).map(mapTeamRow);
  const teamsById = new Map(teams.map((team) => [team.id, team]));

  const candidates = eligibleMatches.flatMap((row) => {
    const homeTeam = teamsById.get(row.home_team_id as string);
    const awayTeam = teamsById.get(row.away_team_id as string);
    if (!homeTeam || !awayTeam) {
      return [];
    }
    return [
      {
        id: row.id as string,
        matchCode: row.match_code as string,
        stageCode: row.stage_code as string,
        groupCode: normalizeNullableString(row.group_code as string | null | undefined),
        kickoffAt: (row.kickoff_at as string | null) ?? null,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
      },
    ];
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "No eligible simulation matches have both teams assigned yet.",
    };
  }

  const preview = generateSimulationBatchPreview(candidates, teamsById);
  if (!preview || preview.matches.length === 0) {
    return {
      ok: false,
      error: "Could not generate a simulation preview from the eligible match batch.",
    };
  }

  return {
    ok: true,
    preview,
    impact: buildSimulationImpactSummary(impact, preview),
    affectedPoolCount: impact.poolCount,
  };
}

function serializeSimulationPreview(
  preview: SimulationBatchPreview,
  impact: AdminImpactSummary,
): SimulationResultsPreview {
  return {
    impact,
    batchType: preview.batchType,
    batchLabel: preview.batchLabel,
    batchKey: preview.batchKey,
    fallbackBatchSize: preview.fallbackBatchSize,
    matchCount: preview.matchCount,
    stageMode: preview.stageMode,
    stageCodes: preview.stageCodes,
    matches: preview.matches.map((match) => ({
      matchId: match.id,
      matchCode: match.matchCode,
      stageCode: match.stageCode,
      groupCode: match.groupCode,
      kickoffAt: match.kickoffAt,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      homePenalties: match.homePenalties,
      awayPenalties: match.awayPenalties,
      winnerTeamId: match.winnerTeamId,
      winnerTeamName: match.winnerTeamName,
      decisionType: match.decisionType,
    })),
  };
}

function previewsMatch(
  serverPreview: SimulationBatchPreview,
  clientPreview: SimulationResultsPreview,
): boolean {
  if (
    serverPreview.batchType !== clientPreview.batchType ||
    serverPreview.batchKey !== clientPreview.batchKey ||
    serverPreview.matches.length !== clientPreview.matches.length
  ) {
    return false;
  }

  const serverByCode = new Map(serverPreview.matches.map((match) => [match.matchCode, match]));

  for (const match of clientPreview.matches) {
    const server = serverByCode.get(match.matchCode);
    if (!server) return false;
    if (
      server.id !== match.matchId ||
      server.stageCode !== match.stageCode ||
      normalizeNullableString(server.groupCode) !== normalizeNullableString(match.groupCode) ||
      server.homeTeamId !== match.homeTeamId ||
      server.awayTeamId !== match.awayTeamId
    ) {
      return false;
    }

    const homeGoals = normalizeScore(match.homeGoals);
    const awayGoals = normalizeScore(match.awayGoals);
    if (homeGoals == null || awayGoals == null) {
      return false;
    }

    const homePenalties =
      match.homePenalties == null ? null : normalizeScore(match.homePenalties);
    const awayPenalties =
      match.awayPenalties == null ? null : normalizeScore(match.awayPenalties);

    if (server.stageCode === "group") {
      if (homePenalties != null || awayPenalties != null) return false;
    } else if (homeGoals === awayGoals) {
      if (
        homePenalties == null ||
        awayPenalties == null ||
        homePenalties === awayPenalties
      ) {
        return false;
      }
    } else if (homePenalties != null || awayPenalties != null) {
      return false;
    }
  }

  return true;
}

export async function previewNextSimulationResultsAction(input: {
  editionId: string;
}): Promise<PreviewSimulationResultsResult> {
  try {
    const editionId = input.editionId.trim();
    if (!editionId) {
      return { ok: false, error: "Edition id is required." };
    }

    const supabase = await createClient();
    const gate = await requireGlobalSimulationEdition(supabase, editionId);
    if (!gate.ok) return gate;

    const bundle = await loadSimulationPreviewBundle(supabase, gate.edition);
    if (!bundle.ok) return bundle;

    logAdminRiskAction({
      action: "simulation_results_generate",
      userId: gate.user.id,
      userEmail: gate.user.email,
      editionId: gate.edition.id,
      editionCode: gate.edition.code,
      isSimulation: true,
      affectedMatchCount: bundle.preview.matchCount,
      affectedPoolCount: bundle.affectedPoolCount,
      affectedParticipantCount: bundle.impact.participantCount,
      previewOnly: true,
      detail: describeSimulationPreview(bundle.preview),
    });

    await logPilotVerificationEvent(supabase, {
      eventType: "simulation_results_previewed",
      userId: gate.user.id,
      message: `Previewed ${bundle.preview.matchCount} simulated match result(s) for edition ${gate.edition.code}.`,
      payload: {
        editionId: gate.edition.id,
        batchType: bundle.preview.batchType,
        batchKey: bundle.preview.batchKey,
        matchCount: bundle.preview.matchCount,
        poolCount: bundle.affectedPoolCount,
        stageMode: bundle.preview.stageMode,
      },
    });

    return {
      ok: true,
      preview: serializeSimulationPreview(bundle.preview, bundle.impact),
    };
  } catch (error) {
    return { ok: false, error: messageFromUnknown(error) };
  }
}

export async function applyPreviewedSimulationResultsAction(input: {
  editionId: string;
  preview: SimulationResultsPreview;
  productionAcknowledged?: boolean;
}): Promise<ApplySimulationResultsResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;

  try {
    const editionId = input.editionId.trim();
    if (!editionId) {
      return { ok: false, error: "Edition id is required." };
    }

    const supabase = await createClient();
    const gate = await requireGlobalSimulationEdition(supabase, editionId);
    if (!gate.ok) return gate;

    const bundle = await loadSimulationPreviewBundle(supabase, gate.edition);
    if (!bundle.ok) return bundle;

    if (!previewsMatch(bundle.preview, input.preview)) {
      return {
        ok: false,
        error:
          "That preview no longer matches the current eligible simulation batch. Generate a fresh preview, then apply again.",
      };
    }

    const poolIds = await poolIdsForEdition(supabase, gate.edition.id);
    const patches = input.preview.matches.map((match) => ({
      matchCode: match.matchCode,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      homePenalties: match.homePenalties,
      awayPenalties: match.awayPenalties,
      status: "finished" as const,
    }));

    const out = await syncOfficialTournament(supabase, {
      editionCode: gate.edition.code,
      poolIds,
      patches,
    });

    logAdminRiskAction({
      action: "simulation_results_generate",
      userId: gate.user.id,
      userEmail: gate.user.email,
      editionId: gate.edition.id,
      editionCode: gate.edition.code,
      isSimulation: true,
      affectedMatchCount: patches.length,
      affectedPoolCount: poolIds.length,
      affectedParticipantCount: bundle.impact.participantCount,
      previewOnly: false,
      detail: out.ok
        ? describeSimulationPreview(bundle.preview)
        : `${describeSimulationPreview(bundle.preview)} error=${out.error}`,
    });

    revalidatePath("/admin/simulation");
    revalidatePath("/admin/pilot");
    revalidatePath(`/admin/simulation/editions/${gate.edition.id}/results`);

    if (!out.ok) {
      return { ok: false, error: out.error };
    }

    await logPilotVerificationEvent(supabase, {
      eventType: "simulation_results_applied",
      userId: gate.user.id,
      message: `Applied ${patches.length} simulated match result(s) for edition ${gate.edition.code}.`,
      payload: {
        editionId: gate.edition.id,
        batchType: bundle.preview.batchType,
        batchKey: bundle.preview.batchKey,
        matchCount: patches.length,
        poolCount: poolIds.length,
        stageMode: bundle.preview.stageMode,
      },
    });

    return {
      ok: true,
      message: `Applied ${patches.length} simulated match result(s) and recalculated ${poolIds.length} simulation pool(s).`,
      affectedPoolCount: poolIds.length,
      matchCount: patches.length,
    };
  } catch (error) {
    return { ok: false, error: messageFromUnknown(error) };
  }
}

/**
 * Clone the live WC schedule into a simulation edition and create a simulation pool.
 */
export async function bootstrapSimulationPoolAction(input: {
  poolName: string;
  joinCode?: string | null;
  isPublic?: boolean;
  productionAcknowledged?: boolean;
}): Promise<BootstrapSimulationPoolResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;
  const name = input.poolName.trim();
  if (!name) {
    return { ok: false, error: "Pool name is required." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can create simulation pools.",
      };
    }

    const { data: rows, error } = await supabase.rpc("bootstrap_simulation_pool", {
      p_pool_name: name,
      p_source_edition_code: OFFICIAL_EDITION_CODE,
      p_join_code: input.joinCode?.trim() || null,
      p_is_public: Boolean(input.isPublic),
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const row = (rows as { pool_id: string; edition_id: string; edition_code: string }[] | null)?.[0];
    if (!row?.pool_id || !row?.edition_id) {
      return { ok: false, error: "Simulation pool was not created." };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/simulation");
    revalidatePath(`/admin/pools/${row.pool_id}`);
    revalidatePath(`/admin/simulation/editions/${row.edition_id}/results`);

    logAdminRiskAction({
      action: "bootstrap_simulation_pool",
      userId: user.id,
      userEmail: user.email,
      editionId: row.edition_id,
      editionCode: row.edition_code,
      isSimulation: true,
      poolId: row.pool_id,
      poolName: name,
      affectedPoolCount: 1,
      detail: "bootstrap_simulation_pool RPC",
    });

    await logPilotVerificationEvent(supabase, {
      eventType: "simulation_pool_created",
      poolId: row.pool_id,
      userId: user.id,
      message: `Created simulation pool “${name}” (edition ${row.edition_code}).`,
      payload: { editionId: row.edition_id, editionCode: row.edition_code },
    });

    revalidatePath("/admin/pilot");

    return {
      ok: true,
      poolId: row.pool_id,
      editionId: row.edition_id,
      editionCode: row.edition_code,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create simulation pool.",
    };
  }
}

/**
 * Sync match scores → results for a simulation edition; recompute simulation pools only.
 */
export type SimulationSyncAckResult =
  | { ok: true }
  | { ok: false; error: string };

export async function runSimulationEditionSyncWithAckAction(input: {
  editionCode: string;
  productionAcknowledged?: boolean;
}): Promise<SimulationSyncAckResult> {
  const ack = checkProductionAdminAck(input.productionAcknowledged);
  if (!ack.ok) return ack;

  const editionCode = input.editionCode.trim();
  if (!editionCode) {
    return { ok: false, error: "Edition code is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return { ok: false, error: "Only global administrators can run simulation sync." };
  }

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("code", editionCode)
    .maybeSingle();

  if (edErr || !edition) {
    return { ok: false, error: edErr?.message ?? "Edition not found." };
  }

  if (!edition.is_simulation) {
    return {
      ok: false,
      error: "Refusing to sync a live edition from the simulation workflow.",
    };
  }

  const editionId = edition.id as string;
  const poolIds = await poolIdsForEdition(supabase, editionId);
  const impact = await fetchEditionImpactSummary(supabase, editionId);

  const out = await syncOfficialTournament(supabase, {
    editionCode,
    poolIds,
  });

  logAdminRiskAction({
    action: "simulation_edition_sync",
    userId: user.id,
    userEmail: user.email,
    editionId,
    editionCode: edition.code as string,
    isSimulation: true,
    affectedPoolCount: poolIds.length,
    affectedParticipantCount: impact?.participantCount,
    detail: out.ok ? "completed" : out.error,
  });

  revalidatePath("/admin/simulation");
  revalidatePath(`/admin/simulation/editions/${editionId}/results`);

  if (!out.ok) {
    return { ok: false, error: out.error };
  }
  return { ok: true };
}

export async function runSimulationEditionSyncFormAction(formData: FormData) {
  const editionCode = String(formData.get("editionCode") ?? "").trim();
  if (!editionCode) {
    redirect("/admin/simulation?err=Missing%20edition%20code");
  }
  const res = await runSimulationEditionSyncWithAckAction({
    editionCode,
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(`/admin/simulation?err=${encodeURIComponent(res.error)}`);
  }
  redirect("/admin/simulation?ok=1");
}

/** @deprecated Prefer runSimulationEditionSyncWithAckAction from the admin UI. */
export async function runSimulationEditionSyncAction(editionCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, is_simulation")
    .eq("code", editionCode.trim())
    .maybeSingle();

  if (edErr || !edition) {
    redirect(
      `/admin/simulation?err=${encodeURIComponent(edErr?.message ?? "Edition not found.")}`,
    );
  }

  if (!edition.is_simulation) {
    redirect(
      `/admin/simulation?err=${encodeURIComponent("Refusing to sync a live edition from the simulation workflow.")}`,
    );
  }

  const res = await runSimulationEditionSyncWithAckAction({
    editionCode: editionCode.trim(),
    productionAcknowledged: true,
  });
  if (!res.ok) {
    redirect(`/admin/simulation?err=${encodeURIComponent(res.error)}`);
  }
  redirect("/admin/simulation?ok=1");
}
