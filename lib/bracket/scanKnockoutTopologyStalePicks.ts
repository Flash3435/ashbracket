import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  buildKnockoutMatchPickRows,
  type ConfirmedR32WinnerContext,
} from "../picks/knockoutMatchPickRows";
import { getGradualKnockoutSelectionState } from "../picks/gradualKnockoutUnlock";
import { mapTeamRow, mapTournamentStageRow } from "../results/mapRows";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";
import { fetchGroupTeamCountryCodesByLetter } from "../tournament/fetchGroupTeamCountryCodesByLetter";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  auditKnockoutTopologyStalePicks,
  summarizeTopologyAuditTotals,
  type TopologyParticipantAudit,
  type TopologyPickRowState,
} from "./auditKnockoutTopologyStalePicks";
import {
  filterStaleFindingsForRepair,
  planClearsFromStaleFindings,
  type TopologyRepairPlanFilters,
  type TopologyStalePickRepairAction,
} from "./planKnockoutTopologyStalePickRepairs";

export type TopologyScanParticipant = {
  participantId: string;
  displayName: string;
  email: string | null;
  audit: TopologyParticipantAudit;
  plannedClears: TopologyStalePickRepairAction[];
};

export type TopologyScanPoolResult = {
  poolId: string;
  poolName: string;
  participantsScanned: number;
  participants: TopologyScanParticipant[];
};

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() ?? teamId;
}

function hasSfPlusSavedPick(
  slots: ReturnType<typeof buildAllParticipantPickDrafts>,
): boolean {
  return slots.some(
    (s) =>
      (s.predictionKind === "semifinalist" ||
        s.predictionKind === "finalist" ||
        s.predictionKind === "champion") &&
      s.teamId.trim(),
  );
}

function enrichRowState(
  slots: ReturnType<typeof buildAllParticipantPickDrafts>,
  ctx: ConfirmedR32WinnerContext,
  teams: Team[],
  audit: TopologyParticipantAudit,
): TopologyParticipantAudit {
  const sfRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams,
    tournamentMatches: ctx.tournamentMatches ?? undefined,
    gradual: ctx.gradual,
    knockoutBracketPicksUnlocked: ctx.knockoutBracketPicksUnlocked ?? true,
  });
  const frozenKinds = new Set<string>();
  for (const row of sfRows) {
    if (row.lockReason !== "frozen") continue;
    if (row.savePredictionKind === "semifinalist" || row.savePredictionKind === "finalist") {
      frozenKinds.add(row.savePredictionKind);
    }
  }

  const stalePicks = audit.stalePicks.map((finding) => {
    let rowState: TopologyPickRowState = finding.rowState;
    const slotRow = slots.find(
      (s) =>
        s.predictionKind === finding.predictionKind &&
        s.slotKey === finding.slotKey,
    );
    if (slotRow && isKnockoutPickLockedOut(slotRow)) {
      rowState = "locked_out";
    } else if (frozenKinds.has(finding.predictionKind)) {
      rowState = "frozen";
    }
    return { ...finding, rowState };
  });

  return { ...audit, stalePicks };
}

function auditParticipantSlots(input: {
  slots: ReturnType<typeof buildAllParticipantPickDrafts>;
  ctx: ConfirmedR32WinnerContext;
  teams: Team[];
}): TopologyParticipantAudit {
  const pathRepair = pruneOfficialKnockoutPathPicks(input.slots, input.ctx);
  const audit = auditKnockoutTopologyStalePicks({
    slots: input.slots,
    teamName: (id) => teamName(id, input.teams) ?? id,
    pathRepairCleared: pathRepair.cleared.filter((c) =>
      ["semifinalist", "finalist", "champion"].includes(c.predictionKind),
    ),
  });
  return enrichRowState(input.slots, input.ctx, input.teams, audit);
}

export async function loadPredictionsForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<Prediction[]> {
  const pageSize = 1000;
  const all: Prediction[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("pool_id", poolId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []).map(mapPredictionRow);
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export async function loadParticipantsForPool(
  supabase: SupabaseClient,
  poolId: string,
): Promise<Array<{ id: string; display_name: string; email: string | null }>> {
  const pageSize = 200;
  const all: Array<{ id: string; display_name: string; email: string | null }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("participants")
      .select("id, display_name, email")
      .eq("pool_id", poolId)
      .order("display_name")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{
      id: string;
      display_name: string;
      email: string | null;
    }>;
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export async function scanKnockoutTopologyStalePicksForPool(
  supabase: SupabaseClient,
  input: {
    pool: { id: string; name: string };
    tournamentMatches: TournamentMatchPublicRow[];
    teams: Team[];
    stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
    groupMap: Awaited<ReturnType<typeof fetchGroupTeamCountryCodesByLetter>>;
    participantFilter?: string;
    repairFilters?: TopologyRepairPlanFilters;
  },
): Promise<TopologyScanPoolResult> {
  const [participants, predictions, scoringRes] = await Promise.all([
    loadParticipantsForPool(supabase, input.pool.id),
    loadPredictionsForPool(supabase, input.pool.id),
    supabase.from("scoring_rules").select("bonus_key").eq("pool_id", input.pool.id),
  ]);
  if (scoringRes.error) throw scoringRes.error;

  const bonusKeys = participantBonusKeysForPool(
    (scoringRes.data ?? []).map((r) => String(r.bonus_key ?? "")),
  );
  const knockoutBracketPicksUnlocked = true;
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    fullRoundOf32Official: knockoutBracketPicksUnlocked,
  });
  const ctx: ConfirmedR32WinnerContext = {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked,
  };

  const participantFilter = input.participantFilter?.trim().toLowerCase() ?? "";
  const repairFilters = input.repairFilters ?? {};
  const scanned: TopologyScanParticipant[] = [];

  for (const participant of participants) {
    if (participantFilter) {
      const hay = `${participant.display_name} ${participant.email ?? ""} ${participant.id}`.toLowerCase();
      if (!hay.includes(participantFilter)) continue;
    }

    const participantPredictions = predictions.filter(
      (p) => p.participantId === participant.id,
    );
    const slots = buildAllParticipantPickDrafts({
      stageByCode: input.stageByCode,
      predictions: participantPredictions,
      participantId: participant.id,
      bonusKeys,
      teams: input.teams,
      groupTeamCountryCodesByLetter: input.groupMap,
    });

    if (!hasSfPlusSavedPick(slots)) continue;

    const audit = auditParticipantSlots({ slots, ctx, teams: input.teams });
    const filteredStale = filterStaleFindingsForRepair(
      audit.stalePicks,
      repairFilters,
    );
    const plannedClears =
      filteredStale.length > 0
        ? planClearsFromStaleFindings({
            poolId: input.pool.id,
            poolName: input.pool.name,
            participantId: participant.id,
            participantName: participant.display_name,
            participantEmail: participant.email,
            slots,
            staleFindings: filteredStale,
          })
        : [];

    if (plannedClears.length === 0 && audit.missingPicks.length === 0) {
      continue;
    }

    scanned.push({
      participantId: participant.id,
      displayName: participant.display_name,
      email: participant.email,
      audit: {
        ...audit,
        stalePicks: filteredStale,
      },
      plannedClears,
    });
  }

  return {
    poolId: input.pool.id,
    poolName: input.pool.name,
    participantsScanned: participants.length,
    participants: scanned,
  };
}

export async function loadTopologyScanContext(supabase: SupabaseClient): Promise<{
  tournamentMatches: TournamentMatchPublicRow[];
  teams: Team[];
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  groupMap: Awaited<ReturnType<typeof fetchGroupTeamCountryCodesByLetter>>;
}> {
  const [matchesRes, stagesRes, teamsRes, groupMap] = await Promise.all([
    supabase.from("tournament_public_matches").select("*"),
    supabase.from("tournament_stages").select("*"),
    supabase.from("teams").select(TEAM_TABLE_SELECT),
    fetchGroupTeamCountryCodesByLetter(supabase),
  ]);
  if (matchesRes.error) throw matchesRes.error;
  if (stagesRes.error) throw stagesRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const stageByCode = Object.fromEntries(
    (stagesRes.data ?? []).map((row) => {
      const stage = mapTournamentStageRow(
        row as Parameters<typeof mapTournamentStageRow>[0],
      );
      return [stage.code, stage];
    }),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  return {
    tournamentMatches: (matchesRes.data ?? []) as unknown as TournamentMatchPublicRow[],
    teams: (teamsRes.data ?? []).map(mapTeamRow),
    stageByCode,
    groupMap,
  };
}

export async function loadActiveWorldCupPoolIds(
  supabase: SupabaseClient,
  poolId?: string,
): Promise<Array<{ id: string; name: string }>> {
  if (poolId) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name")
      .eq("id", poolId)
      .maybeSingle();
    if (error || !data) throw new Error(`Pool not found: ${poolId}`);
    return [{ id: data.id, name: data.name }];
  }
  const { data, error } = await supabase
    .from("pools")
    .select("id, name")
    .is("archived_at", null)
    .eq("is_simulation", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export function summarizeTopologyScanResults(
  poolResults: readonly TopologyScanPoolResult[],
): ReturnType<typeof summarizeTopologyAuditTotals> & {
  poolsScanned: number;
  participantsScanned: number;
  plannedClears: number;
} {
  const participantAudits = poolResults.flatMap((pool) =>
    pool.participants.map((p) => p.audit),
  );
  const totals = summarizeTopologyAuditTotals({
    poolsScanned: poolResults.length,
    participantsScanned: poolResults.reduce(
      (sum, pool) => sum + pool.participantsScanned,
      0,
    ),
    participantAudits,
  });
  const plannedClears = poolResults.reduce(
    (sum, pool) =>
      sum + pool.participants.reduce((s, p) => s + p.plannedClears.length, 0),
    0,
  );
  return {
    poolsScanned: poolResults.length,
    participantsScanned: poolResults.reduce(
      (sum, pool) => sum + pool.participantsScanned,
      0,
    ),
    plannedClears,
    ...totals,
  };
}
