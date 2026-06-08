import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  participantPicksCompleteFromDrafts,
  relevantSlotsForCompleteness,
} from "./picksCompleteness";
import { buildPoolMembershipCompletionStatus } from "../picks/poolMembershipCompletionStatus";

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
  round_of_16: stage("round_of_16", 3),
  quarterfinal: stage("quarterfinal", 4),
  semifinal: stage("semifinal", 5),
  final: stage("final", 6),
};

const pid = "11111111-1111-4111-8111-111111111111";
const poolId = "22222222-2222-4222-8222-222222222222";

/** Full grid of non-null team picks for every required slot (unlocked knockout). */
function filledPredictions(): Prediction[] {
  const preds: Prediction[] = [];
  let n = 0;
  const mk = (
    predictionKind: Prediction["predictionKind"],
    tournamentStageId: string,
    extra: Partial<Prediction> = {},
  ): Prediction => {
    n += 1;
    return {
      id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
      poolId,
      participantId: pid,
      predictionKind,
      teamId: `team-${n}`,
      tournamentStageId,
      groupCode: null,
      slotKey: null,
      bonusKey: null,
      valueText: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  };

  const g = stageByCode.group!.id;
  const letters = "ABCDEFGHIJKL";
  for (const letter of letters) {
    preds.push(
      mk("group_winner", g, { groupCode: letter, slotKey: null }),
      mk("group_runner_up", g, { groupCode: letter, slotKey: null }),
    );
  }

  const r32 = stageByCode.round_of_32!.id;
  for (let i = 1; i <= 8; i++) {
    preds.push(
      mk("third_place_qualifier", r32, {
        slotKey: String(i),
        groupCode: null,
      }),
    );
  }
  for (let i = 1; i <= 32; i++) {
    preds.push(mk("round_of_32", r32, { slotKey: String(i), groupCode: null }));
  }

  const r16 = stageByCode.round_of_16!.id;
  for (let i = 1; i <= 16; i++) {
    preds.push(mk("round_of_16", r16, { slotKey: String(i), groupCode: null }));
  }

  const qf = stageByCode.quarterfinal!.id;
  for (let i = 1; i <= 8; i++) {
    preds.push(
      mk("quarterfinalist", qf, { slotKey: String(i), groupCode: null }),
    );
  }

  const sf = stageByCode.semifinal!.id;
  for (let i = 1; i <= 4; i++) {
    preds.push(mk("semifinalist", sf, { slotKey: String(i), groupCode: null }));
  }

  const fin = stageByCode.final!.id;
  for (let i = 1; i <= 2; i++) {
    preds.push(mk("finalist", fin, { slotKey: String(i), groupCode: null }));
  }
  preds.push(mk("champion", fin, { slotKey: null, groupCode: null }));

  for (const bonusKey of participantBonusKeysForPool([])) {
    preds.push(
      mk("bonus_pick", g, { bonusKey, slotKey: null, groupCode: null }),
    );
  }

  return preds;
}

const slotsEmpty = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: [],
  participantId: pid,
  bonusKeys: participantBonusKeysForPool([]),
});

assert.strictEqual(
  slotsEmpty.length,
  98,
  "expected 24 group + 71 knockout bracket + 3 default bonus slots",
);

const slotsFilled = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: filledPredictions(),
  participantId: pid,
  bonusKeys: participantBonusKeysForPool([]),
});

assert.strictEqual(slotsFilled.length, 98);
assert.strictEqual(
  participantPicksCompleteFromDrafts(slotsFilled, {
    knockoutBracketPicksUnlocked: true,
  }),
  true,
  "fully filled predictions should count as complete when R32 bracket is unlocked",
);

const relLocked = relevantSlotsForCompleteness(slotsFilled, false);
assert.ok(
  relLocked.every((s) => s.teamId.trim() !== ""),
  "when knockout is locked, non-progression slots should still be filled in this fixture",
);

const parity = buildPoolMembershipCompletionStatus(slotsFilled, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(
  parity.isComplete,
  participantPicksCompleteFromDrafts(slotsFilled, {
    knockoutBracketPicksUnlocked: false,
  }),
  "admin bulk helper and canonical status must agree when R32 locked",
);

console.log("picksCompleteness.selftest.ts: ok");
