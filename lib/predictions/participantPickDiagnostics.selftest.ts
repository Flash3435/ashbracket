import assert from "node:assert";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "./buildParticipantPickDrafts";
import {
  buildLegacyCompletionSlots,
  buildParticipantCompletionDiagnostic,
  detectPickKeyMismatches,
  legacyBonusKeysFromScoringRules,
  legacyPicksCompleteFromDrafts,
} from "./participantPickDiagnostics";
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
};

const pid = "11111111-1111-4111-8111-111111111111";
const g = stageByCode.group!.id;
const r32 = stageByCode.round_of_32!.id;

function team(id: string, countryCode: string): Team {
  return {
    id,
    name: id,
    countryCode,
    fifaCode: null,
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

const teams = [
  team("ta1", "AAA"),
  team("ta2", "AAB"),
  team("ta3", "AAC"),
  team("tb1", "BBB"),
  team("tb2", "BBC"),
  team("tb3", "BBD"),
  team("tc1", "CCC"),
  team("tc2", "CCD"),
  team("td1", "DDD"),
  team("te1", "EEE"),
  team("tf1", "FFF"),
  team("tg1", "GGG"),
  team("th1", "HHH"),
];
const groupMap: Record<string, string[]> = {
  A: ["AAA", "AAB", "AAC"],
  B: ["BBB", "BBC", "BBD"],
  C: ["CCC", "CCD"],
  D: ["DDD"],
  E: ["EEE"],
  F: ["FFF"],
  G: ["GGG"],
  H: ["HHH"],
};

function mkPred(
  predictionKind: Prediction["predictionKind"],
  extra: Partial<Prediction> = {},
  n = 1,
): Prediction {
  return {
    id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
    poolId: "22222222-2222-4222-8222-222222222222",
    participantId: pid,
    predictionKind,
    teamId: `team-${n}`,
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

assert.deepStrictEqual(
  legacyBonusKeysFromScoringRules(["golden_boot"]),
  ["golden_boot"],
);
assert.ok(participantBonusKeysForPool(["golden_boot"]).includes("most_goals"));

const remapPreds: Prediction[] = [];
let n = 0;
for (const letter of "ABCDEFGHIJKL") {
  n += 1;
  remapPreds.push(
    mkPred("group_winner", { groupCode: letter, tournamentStageId: g, teamId: `gw-${letter}` }, n),
  );
  n += 1;
  remapPreds.push(
    mkPred("group_runner_up", { groupCode: letter, tournamentStageId: g, teamId: `gr-${letter}` }, n),
  );
}
const thirdTeams = ["tb2", "tc1", "td1", "te1", "tf1", "tg1", "th1", "ta3"];
for (let i = 0; i < 8; i++) {
  n += 1;
  remapPreds.push(
    mkPred(
      "third_place_qualifier",
      {
        tournamentStageId: r32,
        teamId: thirdTeams[i]!,
        groupCode: i === 0 ? "A" : String.fromCharCode(66 + i - 1),
      },
      n,
    ),
  );
}
for (const bonusKey of participantBonusKeysForPool([])) {
  n += 1;
  remapPreds.push(mkPred("bonus_pick", { bonusKey, teamId: `bonus-${bonusKey}` }, n));
}

const remapSlots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: remapPreds,
  participantId: pid,
  bonusKeys: participantBonusKeysForPool([]),
  teams,
  groupTeamCountryCodesByLetter: groupMap,
});
const remapStatus = buildPoolMembershipCompletionStatus(remapSlots, {
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(
  remapStatus.isComplete,
  true,
  "wrong group_code third-place should remap and stay complete",
);

const legacySlotPred = mkPred("third_place_qualifier", {
  tournamentStageId: r32,
  teamId: "tb2",
  slotKey: "3",
  groupCode: null,
});
const legacySlots = buildAllParticipantPickDrafts({
  stageByCode,
  predictions: [legacySlotPred],
  participantId: pid,
  bonusKeys: [],
  teams,
  groupTeamCountryCodesByLetter: groupMap,
});
assert.ok(
  legacySlots.some(
    (s) => s.predictionKind === "third_place_qualifier" && s.teamId === "tb2",
  ),
);

const legacySlotsFull = buildLegacyCompletionSlots({
  stageByCode,
  predictions: remapPreds,
  participantId: pid,
  scoringRuleBonusKeys: [],
  teams,
  groupTeamCountryCodesByLetter: groupMap,
});
assert.strictEqual(
  legacyPicksCompleteFromDrafts(legacySlotsFull, {
    knockoutBracketPicksUnlocked: false,
  }),
  false,
);
assert.strictEqual(remapStatus.isComplete, true);

const diag = buildParticipantCompletionDiagnostic({
  membership: {
    id: pid,
    displayName: "Test",
    userId: null,
    picksFirstSubmittedAt: new Date().toISOString(),
  },
  stageByCode,
  predictions: remapPreds,
  scoringRuleBonusKeys: [],
  bonusKeys: participantBonusKeysForPool([]),
  teams,
  groupTeamCountryCodesByLetter: groupMap,
  knockoutBracketPicksUnlocked: false,
});
assert.strictEqual(diag.canonicalStatus.isComplete, true);

const mismatch = detectPickKeyMismatches({
  predictions: remapPreds,
  participantId: pid,
  slots: remapSlots,
  missingPickKeys: [],
  teams,
  groupTeamCountryCodesByLetter: groupMap,
});
assert.strictEqual(mismatch.possibleKeyMismatch, false);

console.log("participantPickDiagnostics.selftest.ts: ok");
