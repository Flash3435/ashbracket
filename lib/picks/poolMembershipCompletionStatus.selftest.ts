import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  buildAdminIncompleteParticipantBreakdown,
  buildPoolMembershipCompletionStatus,
  buildPoolMembershipCompletionStatusFromPredictions,
  formatCompletionProgressLine,
} from "./poolMembershipCompletionStatus";
import { participantPicksCompleteFromDrafts } from "../communications/picksCompleteness";

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
const bonusKeys = participantBonusKeysForPool(["golden_boot"]);

function mkPred(
  predictionKind: Prediction["predictionKind"],
  tournamentStageId: string,
  extra: Partial<Prediction> = {},
  n = 1,
): Prediction {
  return {
    id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
    poolId: "22222222-2222-4222-8222-222222222222",
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
}

function filledPreLockPredictions(): Prediction[] {
  const preds: Prediction[] = [];
  let n = 0;
  const next = (
    predictionKind: Prediction["predictionKind"],
    tournamentStageId: string,
    extra: Partial<Prediction> = {},
  ) => {
    n += 1;
    return mkPred(predictionKind, tournamentStageId, extra, n);
  };

  const g = stageByCode.group!.id;
  for (const letter of "ABCDEFGHIJKL") {
    preds.push(
      next("group_winner", g, { groupCode: letter }),
      next("group_runner_up", g, { groupCode: letter }),
    );
  }

  const r32 = stageByCode.round_of_32!.id;
  for (const letter of "ABCDEFGH") {
    preds.push(
      next("third_place_qualifier", r32, { groupCode: letter }),
    );
  }

  for (const bonusKey of bonusKeys) {
    preds.push(next("bonus_pick", g, { bonusKey }));
  }

  return preds;
}

const emptySlots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: [],
  participantId: pid,
  bonusKeys,
});

assert.strictEqual(emptySlots.length, 103, "24 group + 12 third + 63 knockout + 4 bonus");

const emptyStatus = buildPoolMembershipCompletionStatus(emptySlots, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(emptyStatus.isComplete, false);
assert.ok(emptyStatus.missingSections.includes("group"));

const preLockPreds = filledPreLockPredictions();
const preLockSlots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: preLockPreds,
  participantId: pid,
  bonusKeys,
});

const preLockStatus = buildPoolMembershipCompletionStatus(preLockSlots, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(preLockStatus.isComplete, true, "all pre-lock requirements met");
assert.deepStrictEqual(preLockStatus.missingSections, []);
assert.ok(
  preLockStatus.displaySummary.includes("Pre-lock picks complete"),
  "complete pre-lock copy",
);

const missingGroup = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: preLockPreds.filter((p) => p.predictionKind !== "group_winner"),
  participantId: pid,
  bonusKeys,
});
const missingGroupStatus = buildPoolMembershipCompletionStatus(missingGroup, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(missingGroupStatus.isComplete, false);
assert.ok(missingGroupStatus.missingSections.includes("group"));

const missingThird = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: preLockPreds.filter(
    (p) =>
      p.predictionKind !== "third_place_qualifier" || p.groupCode !== "A",
  ),
  participantId: pid,
  bonusKeys,
});
const missingThirdStatus = buildPoolMembershipCompletionStatus(missingThird, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(missingThirdStatus.isComplete, false);
assert.ok(missingThirdStatus.missingSections.includes("third_place"));

const missingBonusPreds = preLockPreds.filter(
  (p) => !(p.predictionKind === "bonus_pick" && p.bonusKey === "golden_boot"),
);
const missingBonusSlots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: missingBonusPreds,
  participantId: pid,
  bonusKeys,
});
const missingBonusStatus = buildPoolMembershipCompletionStatus(missingBonusSlots, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(missingBonusStatus.isComplete, false);
assert.ok(missingBonusStatus.missingSections.includes("bonus"));
assert.ok(
  missingBonusStatus.displaySummary.includes("Golden Boot"),
  "regression: group complete but bonus missing",
);

const adminBreakdown = buildAdminIncompleteParticipantBreakdown(missingBonusStatus);
assert.ok(adminBreakdown.missingSummary.includes("Golden Boot"));
assert.strictEqual(adminBreakdown.groupPicks, "24/24");
assert.strictEqual(adminBreakdown.thirdPlacePicks, "8/8");
assert.ok(adminBreakdown.bonusPicks.includes("/"));
assert.notStrictEqual(adminBreakdown.bonusPicks, "1/1");
assert.strictEqual(
  adminBreakdown.knockoutStatus,
  "Not required yet (Round of 32 not published)",
);

const unlockedIncompleteKnockout = buildPoolMembershipCompletionStatus(
  preLockSlots,
  { knockoutBracketPicksUnlocked: true },
);
assert.strictEqual(unlockedIncompleteKnockout.isComplete, false);
assert.ok(unlockedIncompleteKnockout.missingSections.includes("knockout"));

const adminComplete = participantPicksCompleteFromDrafts(preLockSlots, {
  knockoutBracketPicksUnlocked: false,
});
const participantComplete = buildPoolMembershipCompletionStatus(preLockSlots, {
  knockoutBracketPicksUnlocked: false,
}).isComplete;
assert.strictEqual(
  adminComplete,
  participantComplete,
  "admin and participant helpers must agree on same fixture",
);

const fromPredictions = buildPoolMembershipCompletionStatusFromPredictions({
  stageByCode,
  predictions: preLockPreds,
  participantId: pid,
  bonusKeys,
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(fromPredictions.isComplete, true);

const progress = formatCompletionProgressLine(preLockStatus);
assert.ok(progress.includes("Group picks: 24/24"));
assert.ok(progress.includes("Third-place picks: 8/8"));

assert.strictEqual(
  preLockStatus.sections.find((s) => s.id === "third_place")?.filled,
  8,
  "third-place progress shows 8 required advancers",
);

console.log("poolMembershipCompletionStatus.selftest.ts: ok");
