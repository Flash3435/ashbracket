import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TOURNAMENT_STAGE_CODES } from "../account/loadAccountKnockoutSelection";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import { mapTeamRow, mapTournamentStageRow } from "../results/mapRows";
import { TEAM_TABLE_SELECT } from "../teams/teamDbSelect";
import { mapPredictionRow } from "../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { fetchOfficialRoundOf32Complete } from "../tournament/fetchOfficialRoundOf32Complete";
import type { PredictionsPublicRowDb } from "./mapPublicParticipantRows";
import { predictionsFromPublicViewRows } from "./predictionsFromPublicView";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParticipantBracketHeader = {
  displayName: string;
  poolId: string;
  poolName: string;
  lockAt: string | null;
  isPublic: boolean;
};

export type ParticipantBracketSnapshotOk = {
  ok: true;
  header: ParticipantBracketHeader;
  participantId: string;
  teams: Team[];
  stages: TournamentStage[];
  initialSlots: KnockoutPickSlotDraft[];
  knockoutBracketPicksUnlocked: boolean;
};

export type ParticipantBracketSnapshotErr = {
  ok: false;
  kind: "invalid_id" | "not_found" | "load_error";
  message?: string;
};

export type ParticipantBracketSnapshotResult =
  | ParticipantBracketSnapshotOk
  | ParticipantBracketSnapshotErr;

type HeaderRpcRow = {
  display_name: string;
  pool_id: string;
  pool_name: string;
  lock_at: string | null;
  is_public: boolean;
};

export async function loadParticipantBracketSnapshot(
  participantId: string,
): Promise<ParticipantBracketSnapshotResult> {
  const trimmed = participantId.trim();
  if (!trimmed || !UUID_RE.test(trimmed)) {
    return { ok: false, kind: "invalid_id" };
  }

  try {
    const supabase = await createClient();

    const { data: headerRaw, error: headerErr } = await supabase.rpc(
      "ashbracket_participant_bracket_header",
      { p_participant_id: trimmed },
    );

    if (headerErr) {
      return {
        ok: false,
        kind: "load_error",
        message: headerErr.message,
      };
    }

    if (
      headerRaw == null ||
      (typeof headerRaw === "object" &&
        headerRaw !== null &&
        !("pool_id" in headerRaw))
    ) {
      return { ok: false, kind: "not_found" };
    }

    const h = headerRaw as HeaderRpcRow;
    const header: ParticipantBracketHeader = {
      displayName: String(h.display_name ?? "").trim() || "Participant",
      poolId: h.pool_id as string,
      poolName: String(h.pool_name ?? "").trim() || "Pool",
      lockAt: (h.lock_at as string | null) ?? null,
      isPublic: Boolean(h.is_public),
    };

    const [teamsRes, stagesRes] = await Promise.all([
      supabase
        .from("teams")
        .select(TEAM_TABLE_SELECT)
        .order("name", { ascending: true }),
      supabase
        .from("tournament_stages")
        .select(
          "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
        )
        .in("code", [...ACCOUNT_TOURNAMENT_STAGE_CODES])
        .order("sort_order", { ascending: true }),
    ]);

    if (teamsRes.error) {
      return {
        ok: false,
        kind: "load_error",
        message: teamsRes.error.message,
      };
    }
    if (stagesRes.error) {
      return {
        ok: false,
        kind: "load_error",
        message: stagesRes.error.message,
      };
    }

    const teams = (teamsRes.data ?? []).map(mapTeamRow);
    const stages = (stagesRes.data ?? []).map(mapTournamentStageRow);

    for (const code of ACCOUNT_TOURNAMENT_STAGE_CODES) {
      if (!stages.some((s) => s.code === code)) {
        return {
          ok: false,
          kind: "load_error",
          message: `Missing tournament stage "${code}" in Supabase.`,
        };
      }
    }

    const r32Stage = stages.find((s) => s.code === "round_of_32");
    let knockoutBracketPicksUnlocked = true;
    if (r32Stage) {
      knockoutBracketPicksUnlocked = await fetchOfficialRoundOf32Complete(
        supabase,
        r32Stage.id,
      );
    }

    const teamsByCountry = new Map(
      teams.map((t) => [t.countryCode.toUpperCase(), t]),
    );

    let predictions: Prediction[] = [];

    const predSelect =
      "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at";

    const tableRes = await supabase
      .from("predictions")
      .select(predSelect)
      .eq("pool_id", header.poolId)
      .eq("participant_id", trimmed);

    if (tableRes.error) {
      return {
        ok: false,
        kind: "load_error",
        message: tableRes.error.message,
      };
    }

    const tableRows = tableRes.data ?? [];
    if (tableRows.length > 0) {
      type PredRow = Parameters<typeof mapPredictionRow>[0];
      predictions = tableRows.map((r) => mapPredictionRow(r as PredRow));
    } else if (header.isPublic) {
      const pubRes = await supabase
        .from("predictions_public")
        .select(
          "prediction_id, participant_id, pool_id, prediction_kind, group_code, slot_key, bonus_key, stage_code, stage_label, stage_sort_order, team_name, team_country_code",
        )
        .eq("participant_id", trimmed)
        .order("stage_sort_order", { ascending: true, nullsFirst: false })
        .order("prediction_kind", { ascending: true });

      if (pubRes.error) {
        return {
          ok: false,
          kind: "load_error",
          message: pubRes.error.message,
        };
      }

      predictions = predictionsFromPublicViewRows(
        (pubRes.data ?? []) as PredictionsPublicRowDb[],
        {
          poolId: header.poolId,
          participantId: trimmed,
          stages,
          teamsByCountry,
        },
      );
    }

    const bonusKeysFromPreds = [
      ...new Set(
        predictions
          .filter((p) => p.predictionKind === "bonus_pick")
          .map((p) => p.bonusKey)
          .filter((k): k is string => Boolean(k && String(k).trim())),
      ),
    ];
    const bonusKeysOrdered = participantBonusKeysForPool(bonusKeysFromPreds);

    const stageByCode = Object.fromEntries(
      stages.map((s) => [s.code, s]),
    ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

    const initialSlots = buildAllParticipantPickDrafts({
      stageByCode,
      predictions,
      participantId: trimmed,
      bonusKeys: bonusKeysOrdered,
    });

    return {
      ok: true,
      header,
      participantId: trimmed,
      teams,
      stages,
      initialSlots,
      knockoutBracketPicksUnlocked,
    };
  } catch (e) {
    return {
      ok: false,
      kind: "load_error",
      message: e instanceof Error ? e.message : "Failed to load bracket snapshot.",
    };
  }
}
