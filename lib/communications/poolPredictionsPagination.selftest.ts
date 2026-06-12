import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  buildCompletionStatusForParticipant,
  participantPicksCompleteFromDrafts,
  type PicksCompletenessInputs,
} from "./picksCompleteness";

function stage(
  code: TournamentStage["code"],
  n: number,
): TournamentStage {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const now = new Date().toISOString();
  return {
    id,
    code,
    label: code,
    sortOrder: n,
    startsAt: null,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>> = {
  group: stage("group", 1),
  round_of_32: stage("round_of_32", 2),
};

const poolId = "4c0a110a-62ab-42fc-a893-5b7a9c9fbd82";
const g = stageByCode.group!.id;
const r32 = stageByCode.round_of_32!.id;
const bonusKeys = participantBonusKeysForPool([]);

function mkPred(
  participantId: string,
  predictionKind: Prediction["predictionKind"],
  extra: Partial<Prediction> = {},
  n = 1,
): Prediction {
  return {
    id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
    poolId,
    participantId,
    predictionKind,
    teamId: `team-${participantId}-${n}`,
    tournamentStageId: g,
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

function filledPredictionsForParticipant(participantId: string): Prediction[] {
  const preds: Prediction[] = [];
  let n = 0;
  for (const letter of "ABCDEFGHIJKL") {
    n += 1;
    preds.push(
      mkPred(participantId, "group_winner", { groupCode: letter, tournamentStageId: g }, n),
    );
    n += 1;
    preds.push(
      mkPred(participantId, "group_runner_up", { groupCode: letter, tournamentStageId: g }, n),
    );
  }
  for (const letter of "ABCDEFGH") {
    n += 1;
    preds.push(
      mkPred(
        participantId,
        "third_place_qualifier",
        { tournamentStageId: r32, groupCode: letter },
        n,
      ),
    );
  }
  for (const bonusKey of bonusKeys) {
    n += 1;
    preds.push(mkPred(participantId, "bonus_pick", { bonusKey }, n));
  }
  return preds;
}

const participantIds = Array.from({ length: 31 }, (_, i) => {
  const hex = String(i + 1).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
});

const allPredictions = participantIds.flatMap((pid) =>
  filledPredictionsForParticipant(pid),
);

assert.strictEqual(allPredictions.length, 1085, "31 complete participants => 1085 rows");

const inputsBase: Omit<PicksCompletenessInputs, "predictions"> = {
  stageByCode,
  bonusKeys,
  teams: [],
  groupTeamCountryCodesByLetter: {},
  knockoutBracketPicksUnlocked: false,
};

function countTrustedIncomplete(
  predictions: Prediction[],
  ids: string[],
): number {
  let incomplete = 0;
  for (const pid of ids) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode,
      predictions,
      participantId: pid,
      bonusKeys,
      teams: [],
      groupTeamCountryCodesByLetter: {},
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked: false,
      })
    ) {
      incomplete += 1;
    }
  }
  return incomplete;
}

assert.strictEqual(
  countTrustedIncomplete(allPredictions, participantIds),
  0,
  "all 1085 rows => everyone complete",
);

const truncated = allPredictions.slice(0, 1000);
assert.strictEqual(truncated.length, 1000);
const truncatedIncomplete = countTrustedIncomplete(truncated, participantIds);
assert.ok(
  truncatedIncomplete > 0,
  "truncating at Supabase default limit must mark some participants incomplete",
);
assert.ok(
  truncatedIncomplete < participantIds.length,
  "truncation should not mark every participant incomplete",
);

for (const pid of participantIds) {
  const status = buildCompletionStatusForParticipant(
    { ...inputsBase, predictions: allPredictions },
    pid,
  );
  assert.strictEqual(status.isComplete, true, `${pid} is complete with full fetch`);
}

console.log("poolPredictionsPagination.selftest.ts: all assertions passed");
