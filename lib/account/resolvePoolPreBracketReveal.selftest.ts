import assert from "node:assert";
import type { Prediction, Team } from "../../src/types/domain";
import { buildPoolReveal } from "./buildPoolReveal";
import {
  PRE_BRACKET_REVEAL_INTRO,
  resolvePoolPreBracketRevealSections,
  shouldShowPreBracketReveal,
} from "./resolvePoolPreBracketReveal";

const PAST_LOCK = "2020-06-11T03:59:00.000Z";

function pred(
  partial: Partial<Prediction> & Pick<Prediction, "participantId" | "predictionKind">,
): Prediction {
  return {
    id: "pred-1",
    poolId: "pool-1",
    teamId: "",
    tournamentStageId: "stage-group",
    groupCode: null,
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function team(id: string, name: string, countryCode: string): Team {
  return {
    id,
    name,
    countryCode,
    fifaCode: countryCode,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

const teams = [
  team("t-bra", "Brazil", "BRA"),
  team("t-arg", "Argentina", "ARG"),
  team("t-fra", "France", "FRA"),
];

const predictions = [
  pred({
    participantId: "p1",
    predictionKind: "group_winner",
    teamId: "t-bra",
    groupCode: "A",
  }),
  pred({
    participantId: "p2",
    predictionKind: "group_winner",
    teamId: "t-bra",
    groupCode: "B",
  }),
  pred({
    participantId: "p3",
    predictionKind: "group_winner",
    teamId: "t-arg",
    groupCode: "C",
  }),
  pred({
    participantId: "p1",
    predictionKind: "third_place_qualifier",
    teamId: "t-fra",
    slotKey: "tp-1",
  }),
  pred({
    participantId: "p2",
    predictionKind: "bonus_pick",
    teamId: "t-arg",
    bonusKey: "golden_boot",
  }),
];

const sections = resolvePoolPreBracketRevealSections({
  completeParticipantIds: ["p1", "p2", "p3"],
  predictions,
  participantRows: [
    { id: "p1", display_name: "A" },
    { id: "p2", display_name: "B" },
    { id: "p3", display_name: "C" },
  ],
  teams,
  bonusKeys: ["golden_boot"],
  canShowParticipantNames: true,
});

assert.ok(
  sections.some((s) => s.id === "group" && s.teamPicks[0]!.teamName === "Brazil"),
  "group winner aggregation prefers Brazil",
);
assert.strictEqual(sections.find((s) => s.id === "group")!.teamPicks[0]!.count, 2);
assert.ok(
  sections.some((s) => s.id === "third_place"),
  "third-place section is included",
);
assert.ok(
  sections.some((s) => s.id === "bonus" && s.title.includes("Golden Boot")),
  "bonus section uses participant-facing label",
);

assert.equal(
  shouldShowPreBracketReveal({
    locked: true,
    knockoutBracketPicksUnlocked: false,
    totalChampionBrackets: 0,
    preBracketSections: sections,
  }),
  true,
);

assert.equal(
  shouldShowPreBracketReveal({
    locked: true,
    knockoutBracketPicksUnlocked: true,
    totalChampionBrackets: 0,
    preBracketSections: sections,
  }),
  false,
  "post-R32 pools use champion reveal when available",
);

const reveal = buildPoolReveal({
  lockAt: PAST_LOCK,
  deadlineLabel: null,
  relativeCountdown: "locked",
  totalParticipants: 5,
  completeParticipantIds: ["p1", "p2", "p3"],
  championPicks: [],
  viewerPicksComplete: true,
  canShowParticipantNames: true,
  knockoutBracketPicksUnlocked: false,
  preBracketSections: sections,
});

assert.equal(reveal.showPreBracketReveal, true);
assert.equal(reveal.preBracketIntro, PRE_BRACKET_REVEAL_INTRO);
assert.ok(reveal.preBracketSections.length >= 2);

const emptyPool = buildPoolReveal({
  lockAt: PAST_LOCK,
  deadlineLabel: null,
  relativeCountdown: "locked",
  totalParticipants: 0,
  completeParticipantIds: [],
  championPicks: [],
  viewerPicksComplete: false,
  canShowParticipantNames: true,
  knockoutBracketPicksUnlocked: false,
  preBracketSections: [],
});

assert.equal(emptyPool.showPreBracketReveal, false);
assert.equal(emptyPool.totalCompleted, 0);

const championReveal = buildPoolReveal({
  lockAt: PAST_LOCK,
  deadlineLabel: null,
  relativeCountdown: "locked",
  totalParticipants: 2,
  completeParticipantIds: ["p1"],
  championPicks: [
    {
      teamId: "t-bra",
      teamName: "Brazil",
      participantId: "p1",
      participantDisplayName: "A",
    },
  ],
  viewerPicksComplete: true,
  canShowParticipantNames: true,
  knockoutBracketPicksUnlocked: true,
  preBracketSections: sections,
});

assert.equal(championReveal.totalChampionBrackets, 1);
assert.equal(championReveal.showPreBracketReveal, false);

console.log("resolvePoolPreBracketReveal.selftest.ts: all passed");
