import { createClient } from "@/lib/supabase/server";
import type { LeaderboardPublicRowDb } from "../../types/leaderboard";
import type { PublicParticipantDetail } from "../../types/publicParticipant";
import { mapPublicLeaderboardRow } from "../leaderboard/publicLeaderboard";
import {
  mapLedgerPublicRow,
  mapPredictionPublicRow,
  type PointsLedgerPublicRowDb,
  type PredictionsPublicRowDb,
} from "./mapPublicParticipantRows";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export type FetchPublicParticipantResult =
  | { ok: true; data: PublicParticipantDetail }
  | { ok: false; kind: "not_found" | "error"; message?: string };

/**
 * Loads public-safe summary (`leaderboard_public`), picks (`predictions_public`),
 * and ledger lines (`points_ledger_public`) for one participant.
 */
export async function fetchPublicParticipantDetail(
  participantId: string,
): Promise<FetchPublicParticipantResult> {
  if (!isUuid(participantId)) {
    return { ok: false, kind: "not_found" };
  }

  try {
    const supabase = await createClient();

    const [summaryRes, picksRes, ledgerRes] = await Promise.all([
      supabase
        .from("leaderboard_public")
        .select(
          "pool_id, pool_name, participant_id, display_name, total_points, rank",
        )
        .eq("participant_id", participantId)
        .maybeSingle(),
      supabase
        .from("predictions_public")
        .select(
          "prediction_id, participant_id, pool_id, prediction_kind, group_code, slot_key, bonus_key, stage_code, stage_label, stage_sort_order, team_name, team_country_code",
        )
        .eq("participant_id", participantId)
        .order("stage_sort_order", { ascending: true, nullsFirst: false })
        .order("prediction_kind", { ascending: true }),
      supabase
        .from("points_ledger_public")
        .select(
          "id, participant_id, pool_id, points_delta, prediction_kind, created_at, prediction_id, result_id",
        )
        .eq("participant_id", participantId)
        .order("created_at", { ascending: false }),
    ]);

    if (summaryRes.error) {
      return {
        ok: false,
        kind: "error",
        message: summaryRes.error.message,
      };
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

    return {
      ok: true,
      data: {
        displayName: summary.displayName,
        poolName: summary.poolName,
        poolId: summary.poolId,
        participantId: summary.participantId,
        totalPoints: summary.totalPoints,
        rank: summary.rank,
        picks,
        ledger,
      },
    };
  } catch (e) {
    return {
      ok: false,
      kind: "error",
      message:
        e instanceof Error ? e.message : "Failed to load participant profile.",
    };
  }
}
