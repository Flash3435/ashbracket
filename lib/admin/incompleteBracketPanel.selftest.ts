import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
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
const bonusKeys = participantBonusKeysForPool([]);

const slots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: [],
  participantId: pid,
  bonusKeys,
});

const inputs = {
  stageByCode,
  predictions: [] as Prediction[],
  bonusKeys,
  knockoutBracketPicksUnlocked: false,
};

const panelStatus = buildPoolMembershipCompletionStatus(slots, {
  knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
});
const directStatus = buildPoolMembershipCompletionStatus(slots, {
  knockoutBracketPicksUnlocked: false,
});

assert.strictEqual(panelStatus.isComplete, directStatus.isComplete);
assert.ok(
  panelStatus.displaySummary.includes("Missing:"),
  "incomplete panel row should explain missing sections",
);
assert.strictEqual(panelStatus.sections.length, 4);

console.log("incompleteBracketPanel.selftest.ts: ok");
