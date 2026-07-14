import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildPoolStandingsFromLedger } from "../leaderboard/buildPoolStandingsFromLedger";
import { fetchPoolLedgerLinesForStandings } from "../leaderboard/fetchPoolLedgerLinesForStandings";
import type { LeaderboardPublicRowDb } from "../../types/leaderboard";
import type {
  PublicParticipantDetail,
  PublicParticipantPick,
} from "../../types/publicParticipant";
import { mapPublicLeaderboardRow } from "../leaderboard/publicLeaderboard";
import {
  mapLedgerPublicRow,
  mapPredictionPublicRow,
  type PointsLedgerPublicRowDb,
  type PredictionsPublicRowDb,
} from "./mapPublicParticipantRows";
import {
  decodeKnockoutPickStatusMetadata,
} from "../predictions/knockoutPickStatus";
import { normalizeParticipantProfileRouteId } from "./participantProfileRouting";
import { loadThirdPlaceQualifierSettlement } from "@/lib/scoring/ensureThirdPlaceQualifierResults";
import { areThirdPlaceQualifiersSettled } from "@/lib/scoring/resolveOfficialThirdPlaceAdvancers";
import { reconcileParticipantProfileTotals } from "./participantScoringConsistency";
import { settledGroupCodesFromOfficialRows } from "./publicParticipantPresentation";

type ParticipantBracketHeaderRpcRow = {
  display_name: string;
  pool_id: string;
  pool_name: string;
  lock_at: string | null;
  is_public: boolean;
};

type PredictionTableRow = {
  id: string;
  prediction_kind: string;
  group_code: string | null;
  slot_key: string | null;
  bonus_key: string | null;
  team_id: string | null;
  tournament_stage_id: string | null;
  value_text: string | null;
};

export type FetchPublicParticipantResult =
  | { ok: true; data: PublicParticipantDetail }
  | { ok: false; kind: "not_found" | "error"; message?: string };

/**
 * Loads participant profile data when the caller may view that bracket:
 * public pools (anon-safe views) or same-pool members / managers (private pools).
 */
export async function fetchPublicParticipantDetail(
  participantId: string,
): Promise<FetchPublicParticipantResult> {
  const trimmed = normalizeParticipantProfileRouteId(participantId);
  if (!trimmed) {
    return { ok: false, kind: "not_found" };
  }

  try {
    const supabase = await createClient();

    const { data: headerRaw, error: headerErr } = await supabase.rpc(
      "ashbracket_participant_bracket_header",
      { p_participant_id: trimmed },
    );

    if (headerErr) {
      return { ok: false, kind: "error", message: headerErr.message };
    }

    if (
      headerRaw == null ||
      typeof headerRaw !== "object" ||
      !("pool_id" in headerRaw)
    ) {
      return { ok: false, kind: "not_found" };
    }

    const header = headerRaw as ParticipantBracketHeaderRpcRow;
    const poolId = header.pool_id as string;
    const poolName = String(header.pool_name ?? "").trim() || "Pool";
    const displayName =
      String(header.display_name ?? "").trim() || "Participant";

    if (header.is_public) {
      return loadPublicPoolParticipantDetail(supabase, trimmed, {
        poolId,
        poolName,
        displayName,
      });
    }

    return loadPeerPoolParticipantDetail(trimmed, {
      poolId,
      poolName,
      displayName,
    });
  } catch (e) {
    return {
      ok: false,
      kind: "error",
      message:
        e instanceof Error ? e.message : "Failed to load participant profile.",
    };
  }
}

async function loadPublicPoolParticipantDetail(
  supabase: SupabaseClient,
  participantId: string,
  header: { poolId: string; poolName: string; displayName: string },
): Promise<FetchPublicParticipantResult> {
  const [summaryRes, picksRes, ledgerRes] = await Promise.all([
    supabase
      .from("leaderboard_public")
      .select(
        "pool_id, pool_name, participant_id, display_name, total_points, rank",
      )
      .eq("participant_id", participantId)
      .eq("pool_id", header.poolId)
      .maybeSingle(),
    supabase
      .from("predictions_public")
      .select(
        "prediction_id, participant_id, pool_id, prediction_kind, group_code, slot_key, bonus_key, stage_code, stage_label, stage_sort_order, team_name, team_country_code, pick_is_out",
      )
      .eq("participant_id", participantId)
      .eq("pool_id", header.poolId)
      .order("stage_sort_order", { ascending: true, nullsFirst: false })
      .order("prediction_kind", { ascending: true }),
    supabase
      .from("points_ledger_public")
      .select(
        "id, participant_id, pool_id, points_delta, prediction_kind, created_at, prediction_id, result_id",
      )
      .eq("participant_id", participantId)
      .eq("pool_id", header.poolId)
      .order("created_at", { ascending: false }),
  ]);

  if (summaryRes.error) {
    return { ok: false, kind: "error", message: summaryRes.error.message };
  }
  if (!summaryRes.data) {
    return { ok: false, kind: "not_found" };
  }
  if (picksRes.error) {
    return { ok: false, kind: "error", message: picksRes.error.message };
  }
  if (ledgerRes.error) {
    return { ok: false, kind: "error", message: ledgerRes.error.message };
  }

  const summary = mapPublicLeaderboardRow(
    summaryRes.data as LeaderboardPublicRowDb,
  );
  const picks = (picksRes.data ?? []).map((row) =>
    mapPredictionPublicRow(row as PredictionsPublicRowDb),
  );
  const ledger = (ledgerRes.data ?? []).map((row) =>
    mapLedgerPublicRow(row as PointsLedgerPublicRowDb),
  );

  const { detail, issues } = reconcileParticipantProfileTotals({
    displayName: summary.displayName,
    poolName: summary.poolName,
    poolId: summary.poolId,
    participantId: summary.participantId,
    totalPoints: summary.totalPoints,
    rank: summary.rank,
    picks,
    ledger,
  });

  if (issues.length > 0) {
    console.warn("[ashbracket:participant-scoring] integrity issues", {
      participantId: detail.participantId,
      poolId: detail.poolId,
      issues,
    });
  }

  return {
    ok: true,
    data: await attachProfileSettlementContext(detail),
  };
}

async function loadPoolEditionId(
  supabase: SupabaseClient,
  poolId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("pools")
    .select("tournament_edition_id")
    .eq("id", poolId)
    .maybeSingle();
  if (error || !data?.tournament_edition_id) return null;
  return data.tournament_edition_id as string;
}

async function loadSettledGroupCodesForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("results")
    .select("kind, group_code")
    .eq("edition_id", editionId)
    .in("kind", ["group_winner", "group_runner_up"]);
  if (error) throw new Error(error.message);
  return settledGroupCodesFromOfficialRows(data ?? []);
}

/** Attach per-group and third-place settlement flags used by profile pick status. */
async function attachProfileSettlementContext(
  detail: PublicParticipantDetail,
): Promise<PublicParticipantDetail> {
  const service = createServiceRoleClient();
  const editionId = await loadPoolEditionId(service, detail.poolId);
  if (!editionId) return detail;

  const next: PublicParticipantDetail = { ...detail };

  try {
    next.settledGroupCodes = await loadSettledGroupCodesForEdition(
      service,
      editionId,
    );
  } catch {
    // Leave unset; group picks without context continue to show as awaiting.
  }

  try {
    const resolution = await loadThirdPlaceQualifierSettlement(service, editionId);
    next.thirdPlaceQualifiersSettled = areThirdPlaceQualifiersSettled(resolution);
  } catch {
    // Leave unset; third-place picks without context continue to show as awaiting.
  }

  return next;
}

async function loadPeerPoolParticipantDetail(
  participantId: string,
  header: { poolId: string; poolName: string; displayName: string },
): Promise<FetchPublicParticipantResult> {
  const service = createServiceRoleClient();
  const [
    { data: participants, error: participantsErr },
    ledgerRes,
    picks,
  ] = await Promise.all([
    service
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", header.poolId),
    fetchPoolLedgerLinesForStandings(service, header.poolId),
    loadPicksFromPredictionsTable(service, header.poolId, participantId),
  ]);

  if (participantsErr) {
    return { ok: false, kind: "error", message: participantsErr.message };
  }
  if (!ledgerRes.ok) {
    return { ok: false, kind: "error", message: ledgerRes.error };
  }

  const standings = buildPoolStandingsFromLedger({
    poolId: header.poolId,
    poolName: header.poolName,
    participants: participants ?? [],
    ledgerLines: ledgerRes.ledgerLines,
  });
  const standingRow = standings.find((row) => row.participantId === participantId);
  if (!standingRow) {
    return { ok: false, kind: "not_found" };
  }

  const { data: ledgerRows, error: ledgerRowsErr } = await service
    .from("points_ledger")
    .select(
      "id, participant_id, pool_id, points_delta, prediction_kind, created_at, prediction_id, result_id",
    )
    .eq("participant_id", participantId)
    .eq("pool_id", header.poolId)
    .order("created_at", { ascending: false });

  if (ledgerRowsErr) {
    return { ok: false, kind: "error", message: ledgerRowsErr.message };
  }

  const ledger = (ledgerRows ?? []).map((row) =>
    mapLedgerPublicRow(row as PointsLedgerPublicRowDb),
  );

  const { detail, issues } = reconcileParticipantProfileTotals({
    displayName: standingRow.displayName,
    poolName: header.poolName,
    poolId: header.poolId,
    participantId,
    totalPoints: standingRow.totalPoints,
    rank: standingRow.rank,
    picks,
    ledger,
  });

  if (issues.length > 0) {
    console.warn("[ashbracket:participant-scoring] private pool integrity issues", {
      participantId: detail.participantId,
      poolId: detail.poolId,
      ledgerPageCount: ledgerRes.pageCount,
      issues,
    });
  }

  return {
    ok: true,
    data: await attachProfileSettlementContext(detail),
  };
}

async function loadPicksFromPredictionsTable(
  service: SupabaseClient,
  poolId: string,
  participantId: string,
): Promise<PublicParticipantPick[]> {
  const { data: predictions, error } = await service
    .from("predictions")
    .select(
      "id, prediction_kind, group_code, slot_key, bonus_key, team_id, tournament_stage_id, value_text",
    )
    .eq("pool_id", poolId)
    .eq("participant_id", participantId);

  if (error) {
    throw error;
  }

  const rows = (predictions ?? []) as PredictionTableRow[];
  if (rows.length === 0) {
    return [];
  }

  const teamIds = [
    ...new Set(
      rows
        .map((row) => row.team_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const stageIds = [
    ...new Set(
      rows
        .map((row) => row.tournament_stage_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [teamsRes, stagesRes] = await Promise.all([
    teamIds.length > 0
      ? service.from("teams").select("id, name, country_code").in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    stageIds.length > 0
      ? service
          .from("tournament_stages")
          .select("id, code, label, sort_order")
          .in("id", stageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (teamsRes.error) {
    throw teamsRes.error;
  }
  if (stagesRes.error) {
    throw stagesRes.error;
  }

  const teamById = new Map(
    (teamsRes.data ?? []).map((team) => [team.id as string, team]),
  );
  const stageById = new Map(
    (stagesRes.data ?? []).map((stage) => [stage.id as string, stage]),
  );

  const picks = rows.map((row) => {
    const team = row.team_id ? teamById.get(row.team_id) : undefined;
    const stage = row.tournament_stage_id
      ? stageById.get(row.tournament_stage_id)
      : undefined;

    return {
      predictionId: row.id,
      predictionKind: row.prediction_kind,
      groupCode: row.group_code,
      slotKey: row.slot_key,
      bonusKey: row.bonus_key,
      stageCode: (stage?.code as string | undefined) ?? null,
      stageLabel: String(stage?.label ?? "Other"),
      stageSortOrder: Number(stage?.sort_order ?? 10_000),
      teamName: (team?.name as string | undefined) ?? null,
      teamCountryCode: (team?.country_code as string | undefined) ?? null,
      pickIsOut:
        Boolean(row.team_id) &&
        decodeKnockoutPickStatusMetadata(row.value_text)?.status === "out",
    } satisfies PublicParticipantPick;
  });

  picks.sort(
    (a, b) =>
      a.stageSortOrder - b.stageSortOrder ||
      a.predictionKind.localeCompare(b.predictionKind),
  );

  return picks;
}
