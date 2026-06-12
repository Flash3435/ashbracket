import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  buildCompletionStatusForParticipant,
  type PicksCompletenessInputs,
} from "../communications/picksCompleteness";
import { buildIncompleteBracketPanelData } from "./incompleteBracketPanel";

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

const aliciaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const beegeeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fredId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const incompleteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const inputs: PicksCompletenessInputs = {
  stageByCode,
  predictions: [
    ...filledPredictionsForParticipant(aliciaId),
    ...filledPredictionsForParticipant(beegeeId),
    ...filledPredictionsForParticipant(fredId),
    ...filledPredictionsForParticipant(incompleteId).filter(
      (p) => p.predictionKind !== "bonus_pick",
    ),
  ],
  bonusKeys,
  teams: [],
  groupTeamCountryCodesByLetter: {},
  knockoutBracketPicksUnlocked: false,
};

const participants = [
  { id: aliciaId, displayName: "Alicia", email: "a@example.com" },
  { id: beegeeId, displayName: "BeeGee", email: "b@example.com" },
  { id: fredId, displayName: "Fred Morton", email: "f@example.com" },
  {
    id: incompleteId,
    displayName: "Still Missing",
    email: "x@example.com",
  },
];

const picksCompleteById = new Map(
  participants.map((p) => [
    p.id,
    buildCompletionStatusForParticipant(inputs, p.id).isComplete,
  ]),
);

assert.strictEqual(picksCompleteById.get(aliciaId), true);
assert.strictEqual(picksCompleteById.get(beegeeId), true);
assert.strictEqual(picksCompleteById.get(fredId), true);
assert.strictEqual(picksCompleteById.get(incompleteId), false);

const panel = buildIncompleteBracketPanelData({
  poolId,
  poolName: "Work pool",
  lockAtIso: null,
  knockoutBracketPicksUnlocked: false,
  participants: participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    email: p.email,
    picksComplete: picksCompleteById.get(p.id) ?? false,
  })),
  emailConfigured: true,
});

assert.strictEqual(panel.incompleteCount, 1);
assert.strictEqual(panel.completedCount, 3);
const incompleteNames = panel.incompleteParticipants.map((p) => p.displayName);
assert.ok(!incompleteNames.some((n) => /alicia|beegee|fred/i.test(n)));
assert.ok(incompleteNames.some((n) => n.includes("Still Missing")));

const slots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: filledPredictionsForParticipant(aliciaId),
  participantId: aliciaId,
  bonusKeys,
});
assert.strictEqual(
  buildCompletionStatusForParticipant(inputs, aliciaId).isComplete,
  true,
);
assert.ok(slots.filter((s) => s.predictionKind === "group_winner").length === 12);

console.log("loadIncompleteBracketPanel.selftest.ts: ok");
