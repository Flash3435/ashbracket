import assert from "node:assert";
import type { TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../predictions/buildParticipantPickDrafts";
import {
  buildPoolMembershipCompletionStatus,
  formatCompletionProgressLine,
} from "./poolMembershipCompletionStatus";

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

const stageByCode = { group: stage("group", 1) };
const slots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: [],
  participantId: "11111111-1111-4111-8111-111111111111",
  bonusKeys: participantBonusKeysForPool([]),
});

const status = buildPoolMembershipCompletionStatus(slots, {
  knockoutBracketPicksUnlocked: false,
});
const line = formatCompletionProgressLine(status);
assert.ok(line.includes("Group picks:"));
assert.ok(line.includes("not required yet"));

console.log("picksProgressSummary.selftest.ts: ok");
