/**
 * Run: npx tsx lib/participant/publicParticipantPresentation.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicParticipantPresentation,
  pickStatusPresentation,
  settledGroupCodesFromOfficialRows,
  type PickDisplayState,
} from "./publicParticipantPresentation";
import type {
  PublicParticipantDetail,
  PublicParticipantPick,
} from "../../types/publicParticipant";
import {
  assertParticipantScoringTotalsConsistent,
  sumParticipantLedgerPoints,
} from "./participantScoringConsistency";

function statusLabel(state: PickDisplayState): string {
  return pickStatusPresentation(state).label;
}

function pick(partial: Partial<PublicParticipantPick> & Pick<PublicParticipantPick, "predictionId" | "predictionKind">): PublicParticipantPick {
  return {
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    stageCode: "group",
    stageLabel: "Group",
    stageSortOrder: 10,
    teamName: null,
    teamCountryCode: null,
    ...partial,
  };
}

assert.equal(statusLabel("scored"), "Scored");
assert.equal(statusLabel("awaiting"), "Awaiting score");
assert.equal(statusLabel("missed"), "Missed");
assert.equal(statusLabel("empty"), "No pick");
assert.match(
  pickStatusPresentation("missed", { predictionKind: "third_place_qualifier" })
    .meaning,
  /third-place/i,
);
assert.match(
  pickStatusPresentation("missed", { predictionKind: "group_runner_up" }).meaning,
  /group results/i,
);

assert.deepEqual(
  settledGroupCodesFromOfficialRows([
    { kind: "group_winner", group_code: "a" },
    { kind: "group_runner_up", group_code: "A" },
    { kind: "group_winner", group_code: "B" },
    // B runner-up missing → B unsettled
    { kind: "group_winner", group_code: "C" },
    { kind: "group_runner_up", groupCode: "C" },
  ]),
  ["A", "C"],
);

const detail: PublicParticipantDetail = {
  displayName: "Test",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-1",
  totalPoints: 3,
  rank: 1,
  picks: [
    pick({
      predictionId: "p1",
      predictionKind: "group_winner",
      groupCode: "A",
      teamName: "Team A",
      teamCountryCode: "USA",
    }),
    pick({
      predictionId: "p2",
      predictionKind: "group_winner",
      groupCode: "B",
      teamName: "Team B",
      teamCountryCode: "CAN",
    }),
    pick({
      predictionId: "p3",
      predictionKind: "group_winner",
      groupCode: "C",
    }),
  ],
  ledger: [
    {
      id: "l1",
      pointsDelta: 3,
      predictionKind: "group_winner",
      createdAt: "2026-06-12T12:00:00.000Z",
      predictionId: "p1",
      resultId: "r1",
    },
  ],
};

const { summary, sections, ledgerItems } = buildPublicParticipantPresentation(detail);

assert.equal(summary.scoredPicksCount, 1);
assert.equal(summary.missedPicksCount, 0);
assert.equal(summary.awaitingScoreCount, 1);
assert.equal(summary.emptyPicksCount, 1);
assert.equal(summary.pointAwardsCount, 1);

const group = sections.find((s) => s.key === "group_stage");
assert.ok(group);
assert.equal(group!.scoredPicksCount, 1);
assert.equal(group!.awaitingScoreCount, 1);
assert.equal(group!.emptyPicksCount, 1);

assert.equal(ledgerItems[0]?.dateLabel.length > 0, true);
assert.equal(ledgerItems[0]?.stageLabel, "Group stage");

assertParticipantScoringTotalsConsistent({
  leaderboardTotal: detail.totalPoints,
  profileHeaderTotal: detail.totalPoints,
  ledgerTotal: sumParticipantLedgerPoints(detail.ledger),
  stageTotals: sections.map((section) => section.totalPoints),
});

console.log("publicParticipantPresentation selftest: ok");

const settledThirdDetail: PublicParticipantDetail = {
  ...detail,
  thirdPlaceQualifiersSettled: true,
  picks: [
    ...detail.picks,
    pick({
      predictionId: "p-tpq-hit",
      predictionKind: "third_place_qualifier",
      groupCode: "A",
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      stageSortOrder: 20,
      teamName: "Team TPQ Hit",
      teamCountryCode: "USA",
    }),
    pick({
      predictionId: "p-tpq-miss",
      predictionKind: "third_place_qualifier",
      groupCode: "B",
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      stageSortOrder: 20,
      teamName: "Team TPQ Miss",
      teamCountryCode: "CAN",
    }),
  ],
  ledger: [
    ...detail.ledger,
    {
      id: "l-tpq",
      pointsDelta: 4,
      predictionKind: "third_place_qualifier",
      createdAt: "2026-06-30T12:00:00.000Z",
      predictionId: "p-tpq-hit",
      resultId: "r-tpq",
    },
  ],
};

const thirdPresentation = buildPublicParticipantPresentation(settledThirdDetail);
const thirdSection = thirdPresentation.sections.find(
  (s) => s.key === "third_place_advancers",
);
assert.ok(thirdSection);
assert.equal(thirdSection!.scoredPicksCount, 1);
assert.equal(thirdSection!.missedPicksCount, 1);
assert.equal(thirdSection!.awaitingScoreCount, 0);
assert.match(
  thirdSection!.picks.find((p) => p.predictionId === "p-tpq-miss")!.status.meaning,
  /third-place/i,
);

console.log("publicParticipantPresentation third-place settled selftest: ok");

// --- Per-group settlement: settled misses vs unsettled awaiting ---
const groupSettlementDetail: PublicParticipantDetail = {
  displayName: "Group settle",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-g",
  totalPoints: 3,
  rank: 1,
  settledGroupCodes: ["C", "G"],
  picks: [
    pick({
      predictionId: "gw-c-scored",
      predictionKind: "group_winner",
      groupCode: "C",
      teamName: "Brazil",
      teamCountryCode: "BRA",
    }),
    pick({
      predictionId: "gr-c-miss",
      predictionKind: "group_runner_up",
      groupCode: "C",
      teamName: "Scotland",
      teamCountryCode: "SCO",
    }),
    pick({
      predictionId: "gr-g-miss",
      predictionKind: "group_runner_up",
      groupCode: "G",
      teamName: "New Zealand",
      teamCountryCode: "NZL",
    }),
    pick({
      predictionId: "gr-h-await",
      predictionKind: "group_runner_up",
      groupCode: "H",
      teamName: "Uruguay",
      teamCountryCode: "URU",
    }),
    pick({
      predictionId: "gw-c-empty",
      predictionKind: "group_winner",
      groupCode: "G",
      teamName: null,
      teamCountryCode: null,
    }),
  ],
  ledger: [
    {
      id: "l-gw-c",
      pointsDelta: 3,
      predictionKind: "group_winner",
      createdAt: "2026-06-20T12:00:00.000Z",
      predictionId: "gw-c-scored",
      resultId: "r-c-w",
    },
  ],
};

const settledGroupPresentation =
  buildPublicParticipantPresentation(groupSettlementDetail);
const settledGroupSection = settledGroupPresentation.sections.find(
  (s) => s.key === "group_stage",
)!;
assert.ok(settledGroupSection);

const byId = new Map(
  settledGroupSection.picks.map((p) => [p.predictionId, p]),
);

assert.equal(byId.get("gw-c-scored")!.state, "scored");
assert.equal(byId.get("gr-c-miss")!.state, "missed");
assert.equal(byId.get("gr-g-miss")!.state, "missed");
assert.equal(byId.get("gr-h-await")!.state, "awaiting");
assert.equal(byId.get("gw-c-empty")!.state, "empty");

assert.equal(settledGroupPresentation.summary.scoredPicksCount, 1);
assert.equal(settledGroupPresentation.summary.missedPicksCount, 2);
assert.equal(settledGroupPresentation.summary.awaitingScoreCount, 1);
assert.equal(settledGroupPresentation.summary.emptyPicksCount, 1);
assert.equal(settledGroupSection.missedPicksCount, 2);
assert.equal(settledGroupSection.awaitingScoreCount, 1);
assert.equal(byId.get("gr-c-miss")!.status.label, "Missed");
assert.match(byId.get("gr-c-miss")!.status.meaning, /group results/i);

console.log("publicParticipantPresentation per-group settlement selftest: ok");

// pickIsOut still wins over settlement/ledger absence
const outDetail: PublicParticipantDetail = {
  displayName: "Out",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-out",
  totalPoints: 0,
  rank: 2,
  settledGroupCodes: ["A"],
  picks: [
    pick({
      predictionId: "pred-out",
      predictionKind: "round_of_16",
      slotKey: "2",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "Germany",
      teamCountryCode: "GER",
      pickIsOut: true,
    }),
  ],
  ledger: [],
};
const outPresentation = buildPublicParticipantPresentation(outDetail);
assert.equal(outPresentation.sections.flatMap((s) => s.picks)[0]!.state, "out");
assert.equal(outPresentation.summary.awaitingScoreCount, 0);
assert.equal(outPresentation.summary.missedPicksCount, 0);

console.log("publicParticipantPresentation pickIsOut selftest: ok");

// --- Knockout once-per-team: awarded vs satisfied vs missed vs awaiting ---
function koProgress(
  teamId: string,
  furthest: "round_of_32" | "round_of_16" | "quarterfinalist" | "semifinalist" | "finalist" | "champion" | null,
  eliminated: boolean,
  inRoundOf32Field = true,
) {
  return {
    teamId,
    furthestOfficialKind: furthest,
    eliminated,
    inRoundOf32Field,
  };
}

const fra = "team-fra";
const eng = "team-eng";
const can = "team-can";
const bra = "team-bra";
const arg = "team-arg";
const esp = "team-esp";

const koDetail: PublicParticipantDetail = {
  displayName: "KO",
  poolName: "Pool",
  poolId: "pool-ko",
  participantId: "part-ko",
  totalPoints: 36,
  rank: 1,
  knockoutRoundOf32FieldComplete: true,
  knockoutKindsWithPositivePoints: [
    "round_of_16",
    "quarterfinalist",
    "semifinalist",
    "finalist",
    "champion",
  ],
  knockoutOfficialResultCounts: {
    round_of_32: 16,
    round_of_16: 16,
    quarterfinalist: 8,
    semifinalist: 4,
    finalist: 1,
  },
  knockoutProgressByTeamId: {
    [fra]: koProgress(fra, "semifinalist", true),
    [eng]: koProgress(eng, "semifinalist", false),
    [can]: koProgress(can, "round_of_16", true),
    [bra]: koProgress(bra, "round_of_16", true),
    [arg]: koProgress(arg, "semifinalist", false),
    [esp]: koProgress(esp, "finalist", false),
  },
  knockoutAwardByTeamId: {
    [fra]: {
      teamId: fra,
      representativePredictionId: "ko-fra-r32",
      points: 16,
      resultKind: "semifinalist",
    },
    [can]: {
      teamId: can,
      representativePredictionId: "ko-can-r16",
      points: 4,
      resultKind: "round_of_16",
    },
    [eng]: {
      teamId: eng,
      representativePredictionId: "ko-eng-qf",
      points: 16,
      resultKind: "semifinalist",
    },
    [esp]: {
      teamId: esp,
      representativePredictionId: "ko-esp-qf",
      points: 24,
      resultKind: "finalist",
    },
    [arg]: {
      teamId: arg,
      representativePredictionId: "ko-arg-sf",
      points: 16,
      resultKind: "semifinalist",
    },
  },
  picks: [
    pick({
      predictionId: "ko-fra-r32",
      predictionKind: "round_of_32",
      slotKey: "9",
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      stageSortOrder: 30,
      teamName: "France",
      teamCountryCode: "FRA",
      teamId: fra,
    }),
    pick({
      predictionId: "ko-fra-r16",
      predictionKind: "round_of_16",
      slotKey: "5",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "France",
      teamCountryCode: "FRA",
      teamId: fra,
    }),
    pick({
      predictionId: "ko-fra-sf",
      predictionKind: "semifinalist",
      slotKey: "1",
      stageCode: "semifinal",
      stageLabel: "Semi-finals",
      stageSortOrder: 60,
      teamName: "France",
      teamCountryCode: "FRA",
      teamId: fra,
    }),
    pick({
      predictionId: "ko-fra-final",
      predictionKind: "finalist",
      slotKey: "1",
      stageCode: "final",
      stageLabel: "Final",
      stageSortOrder: 70,
      teamName: "France",
      teamCountryCode: "FRA",
      teamId: fra,
    }),
    pick({
      predictionId: "ko-fra-champ",
      predictionKind: "champion",
      stageCode: "final",
      stageLabel: "Final",
      stageSortOrder: 80,
      teamName: "France",
      teamCountryCode: "FRA",
      teamId: fra,
    }),
    pick({
      predictionId: "ko-can-r16",
      predictionKind: "round_of_16",
      slotKey: "1",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "Canada",
      teamCountryCode: "CAN",
      teamId: can,
    }),
    pick({
      predictionId: "ko-eng-qf",
      predictionKind: "quarterfinalist",
      slotKey: "4",
      stageCode: "quarterfinal",
      stageLabel: "Quarter-finals",
      stageSortOrder: 50,
      teamName: "England",
      teamCountryCode: "ENG",
      teamId: eng,
    }),
    pick({
      predictionId: "ko-eng-r16",
      predictionKind: "round_of_16",
      slotKey: "8",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "England",
      teamCountryCode: "ENG",
      teamId: eng,
    }),
    pick({
      predictionId: "ko-bra-qf",
      predictionKind: "quarterfinalist",
      slotKey: "3",
      stageCode: "quarterfinal",
      stageLabel: "Quarter-finals",
      stageSortOrder: 50,
      teamName: "Brazil",
      teamCountryCode: "BRA",
      teamId: bra,
    }),
    pick({
      predictionId: "ko-arg-sf",
      predictionKind: "semifinalist",
      slotKey: "4",
      stageCode: "semifinal",
      stageLabel: "Semi-finals",
      stageSortOrder: 60,
      teamName: "Argentina",
      teamCountryCode: "ARG",
      teamId: arg,
    }),
    pick({
      predictionId: "ko-arg-final",
      predictionKind: "finalist",
      slotKey: "2",
      stageCode: "final",
      stageLabel: "Final",
      stageSortOrder: 70,
      teamName: "Argentina",
      teamCountryCode: "ARG",
      teamId: arg,
    }),
    pick({
      predictionId: "ko-esp-qf",
      predictionKind: "quarterfinalist",
      slotKey: "5",
      stageCode: "quarterfinal",
      stageLabel: "Quarter-finals",
      stageSortOrder: 50,
      teamName: "Spain",
      teamCountryCode: "ESP",
      teamId: esp,
    }),
    pick({
      predictionId: "ko-esp-sf",
      predictionKind: "semifinalist",
      slotKey: "2",
      stageCode: "semifinal",
      stageLabel: "Semi-finals",
      stageSortOrder: 60,
      teamName: "Spain",
      teamCountryCode: "ESP",
      teamId: esp,
    }),
    pick({
      predictionId: "ko-out",
      predictionKind: "round_of_16",
      slotKey: "2",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "Germany",
      teamCountryCode: "GER",
      teamId: "team-ger",
      pickIsOut: true,
    }),
  ],
  ledger: [
    {
      id: "l-fra",
      pointsDelta: 16,
      predictionKind: "semifinalist",
      createdAt: "2026-07-14T12:00:00.000Z",
      predictionId: "ko-fra-r32",
      resultId: "r-fra",
    },
    {
      id: "l-can",
      pointsDelta: 4,
      predictionKind: "round_of_16",
      createdAt: "2026-07-01T12:00:00.000Z",
      predictionId: "ko-can-r16",
      resultId: "r-can",
    },
    {
      id: "l-eng",
      pointsDelta: 16,
      predictionKind: "semifinalist",
      createdAt: "2026-07-14T12:00:00.000Z",
      predictionId: "ko-eng-qf",
      resultId: "r-eng",
    },
    {
      id: "l-esp",
      pointsDelta: 24,
      predictionKind: "finalist",
      createdAt: "2026-07-14T12:00:00.000Z",
      predictionId: "ko-esp-qf",
      resultId: "r-esp",
    },
    {
      id: "l-arg",
      pointsDelta: 16,
      predictionKind: "semifinalist",
      createdAt: "2026-07-14T12:00:00.000Z",
      predictionId: "ko-arg-sf",
      resultId: "r-arg",
    },
  ],
};

const koPresentation = buildPublicParticipantPresentation(koDetail);
const koById = new Map(
  koPresentation.sections.flatMap((s) => s.picks).map((p) => [p.predictionId, p]),
);

// 1. Ledger on this prediction → awarded + points
assert.equal(koById.get("ko-fra-r32")!.state, "awarded");
assert.equal(koById.get("ko-fra-r32")!.pointsEarned, 16);
assert.equal(koById.get("ko-fra-r32")!.status.label, "Awarded");
assert.equal(koById.get("ko-can-r16")!.state, "awarded");
assert.equal(koById.get("ko-can-r16")!.pointsEarned, 4);

// 2–3. Same team, deeper progress → earlier cards satisfied, no duplicate points
assert.equal(koById.get("ko-fra-r16")!.state, "satisfied");
assert.equal(koById.get("ko-fra-r16")!.pointsEarned, 0);
assert.equal(koById.get("ko-fra-r16")!.footerLabel, "Already counted");
assert.equal(koById.get("ko-fra-sf")!.state, "satisfied");
assert.equal(koById.get("ko-eng-r16")!.state, "satisfied");
assert.equal(koById.get("ko-eng-qf")!.state, "awarded");

// 4. Eliminated before depth → missed
assert.equal(koById.get("ko-bra-qf")!.state, "missed");
assert.equal(koById.get("ko-bra-qf")!.pointsEarned, 0);
assert.match(koById.get("ko-bra-qf")!.status.meaning, /eliminated/i);

// 5–7. Alive below depth → awaiting; lost SF → missed finalist/champion
assert.equal(koById.get("ko-arg-final")!.state, "awaiting");
assert.equal(koById.get("ko-fra-final")!.state, "missed");
assert.equal(koById.get("ko-fra-champ")!.state, "missed");

// 8–9 covered above. 10. pickIsOut precedence
assert.equal(koById.get("ko-out")!.state, "out");

// Spain SF satisfied (award on QF card)
assert.equal(koById.get("ko-esp-qf")!.state, "awarded");
assert.equal(koById.get("ko-esp-sf")!.state, "satisfied");
assert.equal(koById.get("ko-arg-sf")!.state, "awarded");

// 12. Section summary + points from ledger only
const r16Section = koPresentation.sections.find((s) => s.key === "round_of_16")!;
assert.ok(r16Section.awardedPicksCount >= 1);
assert.ok(r16Section.satisfiedPicksCount >= 1);
assert.equal(
  koPresentation.sections.reduce((sum, s) => sum + s.totalPoints, 0),
  16 + 4 + 16 + 24 + 16,
);
assert.equal(koById.get("ko-fra-r16")!.pointsEarned, 0);

assert.equal(koPresentation.summary.awardedPicksCount, 5);
assert.equal(koPresentation.summary.satisfiedPicksCount, 4);
assert.equal(koPresentation.summary.missedPicksCount, 3);
assert.equal(koPresentation.summary.awaitingScoreCount, 1);
assert.equal(koPresentation.summary.outPicksCount, 1);
assert.equal(koPresentation.diagnostics.consistencyErrors.length, 0);

console.log("publicParticipantPresentation knockout awarded/satisfied selftest: ok");

// 13. Consistency guard: satisfied depth but missing team award
const consistencyDetail: PublicParticipantDetail = {
  displayName: "Broken",
  poolName: "Pool",
  poolId: "pool-x",
  participantId: "part-x",
  totalPoints: 0,
  rank: 1,
  knockoutRoundOf32FieldComplete: true,
  knockoutKindsWithPositivePoints: ["round_of_16"],
  knockoutOfficialResultCounts: { round_of_16: 16 },
  knockoutProgressByTeamId: {
    [eng]: koProgress(eng, "round_of_16", true),
  },
  knockoutAwardByTeamId: {},
  picks: [
    pick({
      predictionId: "broken-eng",
      predictionKind: "round_of_16",
      slotKey: "8",
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "England",
      teamCountryCode: "ENG",
      teamId: eng,
    }),
  ],
  ledger: [],
};
const consistencyPresentation = buildPublicParticipantPresentation(consistencyDetail);
assert.ok(consistencyPresentation.diagnostics.consistencyErrors.length > 0);
assert.equal(
  consistencyPresentation.sections.flatMap((s) => s.picks)[0]!.state,
  "awaiting",
  "must not claim Satisfied without a team award",
);

console.log("publicParticipantPresentation knockout consistency selftest: ok");
