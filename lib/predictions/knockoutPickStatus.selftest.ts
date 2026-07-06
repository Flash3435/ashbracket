import assert from "node:assert/strict";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Prediction } from "../../src/types/domain";
import { buildParticipantDashboardMissingKnockoutPicks } from "../admin/adminKnockoutPickStatus";
import { validatedKnockoutMatchWinner } from "../picks/knockoutMatchPickRows";
import { applyKnockoutPathInvalidation } from "./knockoutPathInvalidation";
import {
  clearedOutPickRowKeys,
  decodeKnockoutPickStatusMetadata,
  encodeKnockoutPickStatusMetadata,
  isKnockoutPickLockedOut,
  isKnockoutPredictionScoringEligible,
  knockoutPickStatusValueText,
  participantPickSlotPayloadFromDraft,
} from "./knockoutPickStatus";
import { pruneOfficialKnockoutPathPicks } from "./pruneOfficialKnockoutPathPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { computePoolScores } from "../../src/lib/scoring/computePoolScores";

function matchRow(
  partial: Partial<TournamentMatchPublicRow> & Pick<TournamentMatchPublicRow, "match_id" | "stage_code" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed",
    edition_code: "2026",
    stage_label: partial.stage_code,
    stage_sort_order: 1,
    group_code: null,
    round_index: 0,
    kickoff_at: null,
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: null,
    home_country_code: null,
    away_team_name: null,
    away_country_code: null,
    winner_team_name: null,
    winner_country_code: null,
    ...partial,
  };
}

function qf(slotKey: string, teamId = "", pickStatus: KnockoutPickSlotDraft["pickStatus"] = null): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "QF",
    slotLabel: slotKey,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    pickStatus,
    invalidReason: pickStatus === "out" ? "not_in_official_matchup" : null,
  };
}

function r16Winner(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "R16",
    slotLabel: slotKey,
    predictionKind: "round_of_16",
    tournamentStageId: "r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

// value_text round-trip
{
  const encoded = encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: "not_in_official_matchup",
  });
  const decoded = decodeKnockoutPickStatusMetadata(encoded);
  assert.equal(decoded?.status, "out");
  assert.equal(decoded?.reason, "not_in_official_matchup");
}

// locked invalid pick preserves selected team when marked out
{
  const row = qf("1", "can", "out");
  assert.equal(isKnockoutPickLockedOut(row), true);
  assert.equal(row.teamId, "can");
}

// editable invalid pick preserves teamId and marks out when audit flags mismatch
{
  const before = [
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    qf("1", "can"),
  ];
  const { slots: pruned, cleared } = pruneOfficialKnockoutPathPicks(before);
  const finalized = applyKnockoutPathInvalidation(pruned, cleared, {
    teams: [],
    tournamentMatches: [],
    knockoutBracketPicksUnlocked: true,
  });
  const editable = finalized.find(
    (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1",
  );
  assert.equal(editable?.teamId, "can");
  assert.equal(editable?.pickStatus ?? null, null);
}

// locked out pick does not count as missing
{
  const slots = [
    r16Winner("2", "ger"),
    r16Winner("5", "fra"),
    qf("1", "can", "out"),
  ];
  const missing = buildParticipantDashboardMissingKnockoutPicks({
    slots,
    teams: [],
    officialRoundOf32Complete: true,
    tournamentMatches: [
      matchRow({
        match_id: "m97",
        stage_code: "quarterfinal",
        match_code: "M97",
        kickoff_at: "2026-07-01T00:00:00.000Z",
        home_country_code: "GER",
        away_country_code: "FRA",
      }),
    ],
    clearedPickRowKeys: clearedOutPickRowKeys(slots),
  });
  assert.equal(missing.actionableCount, 0);
}

// locked out pick is not a validated winner
{
  const rows = [
    {
      matchIndex: 0,
      fifaMatchNo: 97,
      rowKey: "x",
      saveRowKey: "quarterfinalist|1",
      savePredictionKind: "quarterfinalist" as const,
      saveSlotKey: "1",
      homeTeamId: "ger",
      awayTeamId: "fra",
      winnerTeamId: "can",
      pickStatus: "out" as const,
      lockReason: "frozen" as const,
      display: {
        heading: "M97",
        emptyPrimaryLine: "Canada · Out",
        kickoffIso: null,
        statusLine: "Pick out",
        chooseButtonLabel: "Choose winner",
      },
      kickoffIso: null,
    },
  ];
  assert.equal(validatedKnockoutMatchWinner(rows[0]), null);
}

// locked out pick does not score as advanced
{
  const poolId = "pool-1111-1111-1111-111111111111";
  const participantId = "part-1111-1111-1111-111111111111";
  const now = "2026-01-01T00:00:00.000Z";
  const pred: Prediction = {
    id: "pred-1",
    poolId,
    participantId,
    predictionKind: "quarterfinalist",
    teamId: "team-can",
    tournamentStageId: "stage-qf",
    groupCode: null,
    slotKey: "1",
    bonusKey: null,
    valueText: knockoutPickStatusValueText({
      teamId: "team-can",
      pickStatus: "out",
      invalidReason: "not_in_official_matchup",
    }),
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(isKnockoutPredictionScoringEligible(pred), true);

  const outcome = computePoolScores({
    poolId,
    predictions: [pred],
    results: [
      {
        id: "res-qf",
        tournamentStageId: "stage-qf",
        kind: "quarterfinalist",
        teamId: "team-can",
        groupCode: null,
        slotKey: "1",
        valueText: null,
        resolvedAt: now,
        createdAt: now,
      },
    ],
    scoringRules: [
      {
        id: "rule-qf",
        poolId,
        predictionKind: "quarterfinalist",
        bonusKey: null,
        points: 5,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  assert.equal(outcome.totalsByParticipantId[participantId] ?? 0, 5);
}

// save payload carries out metadata
{
  const payload = participantPickSlotPayloadFromDraft(
    qf("1", "can", "out"),
  );
  assert.equal(payload.teamId, "can");
  assert.ok(payload.valueText?.includes("ab_pick_status:"));
}

console.log("knockoutPickStatus.selftest.ts: ok");
