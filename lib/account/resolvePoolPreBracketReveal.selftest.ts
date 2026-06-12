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

// Group winner: Argentina picked by A/B, Brazil by C — "went another way" for Argentina is C
{
  const groupPreds = [
    pred({
      participantId: "p1",
      predictionKind: "group_winner",
      teamId: "t-arg",
      groupCode: "A",
    }),
    pred({
      participantId: "p2",
      predictionKind: "group_winner",
      teamId: "t-arg",
      groupCode: "B",
    }),
    pred({
      participantId: "p3",
      predictionKind: "group_winner",
      teamId: "t-bra",
      groupCode: "C",
    }),
  ];
  const groupSections = resolvePoolPreBracketRevealSections({
    completeParticipantIds: ["p1", "p2", "p3"],
    predictions: groupPreds,
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
      { id: "p3", display_name: "C" },
    ],
    teams,
    bonusKeys: [],
    canShowParticipantNames: true,
  });
  const groupSection = groupSections.find((s) => s.id === "group")!;
  const argentina = groupSection.teamPicks.find((p) => p.teamName === "Argentina")!;
  const brazil = groupSection.teamPicks.find((p) => p.teamName === "Brazil")!;
  assert.deepStrictEqual(argentina.participantNames, ["A", "B"]);
  assert.deepStrictEqual(argentina.notPickedParticipantNames, ["C"]);
  assert.deepStrictEqual(brazil.participantNames, ["C"]);
  assert.deepStrictEqual(brazil.notPickedParticipantNames, ["A", "B"]);
}

// Third-place: Canada not among advancers for one participant
{
  const canada = team("t-can", "Canada", "CAN");
  const thirdPreds = [
    pred({
      participantId: "p1",
      predictionKind: "third_place_qualifier",
      teamId: "t-can",
      slotKey: "tp-1",
    }),
    pred({
      participantId: "p2",
      predictionKind: "third_place_qualifier",
      teamId: "t-fra",
      slotKey: "tp-1",
    }),
    pred({
      participantId: "p3",
      predictionKind: "third_place_qualifier",
      teamId: "t-fra",
      slotKey: "tp-1",
    }),
  ];
  const thirdSections = resolvePoolPreBracketRevealSections({
    completeParticipantIds: ["p1", "p2", "p3"],
    predictions: thirdPreds,
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
      { id: "p3", display_name: "C" },
    ],
    teams: [...teams, canada],
    bonusKeys: [],
    canShowParticipantNames: true,
  });
  const third = thirdSections.find((s) => s.id === "third_place")!;
  const canadaPick = third.teamPicks.find((p) => p.teamName === "Canada")!;
  const francePick = third.teamPicks.find((p) => p.teamName === "France")!;
  assert.deepStrictEqual(canadaPick.participantNames, ["A"]);
  assert.deepStrictEqual(canadaPick.notPickedParticipantNames, ["B", "C"]);
  assert.deepStrictEqual(francePick.participantNames, ["B", "C"]);
  assert.deepStrictEqual(francePick.notPickedParticipantNames, ["A"]);
}

// Bonus: not-picked scoped to same bonus question only
{
  const bonusPreds = [
    pred({
      participantId: "p1",
      predictionKind: "bonus_pick",
      teamId: "t-arg",
      bonusKey: "golden_boot",
    }),
    pred({
      participantId: "p2",
      predictionKind: "bonus_pick",
      teamId: "t-bra",
      bonusKey: "golden_boot",
    }),
    pred({
      participantId: "p3",
      predictionKind: "bonus_pick",
      teamId: "t-arg",
      bonusKey: "golden_glove",
    }),
  ];
  const bonusSections = resolvePoolPreBracketRevealSections({
    completeParticipantIds: ["p1", "p2", "p3"],
    predictions: bonusPreds,
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
      { id: "p3", display_name: "C" },
    ],
    teams,
    bonusKeys: ["golden_boot", "golden_glove"],
    canShowParticipantNames: true,
  });
  const goldenBoot = bonusSections.find((s) => s.title.includes("Golden Boot"))!;
  const argBoot = goldenBoot.teamPicks.find((p) => p.teamName === "Argentina")!;
  const braBoot = goldenBoot.teamPicks.find((p) => p.teamName === "Brazil")!;
  assert.deepStrictEqual(argBoot.participantNames, ["A"]);
  assert.deepStrictEqual(argBoot.notPickedParticipantNames, ["B"]);
  assert.deepStrictEqual(braBoot.participantNames, ["B"]);
  assert.deepStrictEqual(braBoot.notPickedParticipantNames, ["A"]);
}

// Incomplete participant excluded from not-picked list
{
  const incompleteSections = resolvePoolPreBracketRevealSections({
    completeParticipantIds: ["p1", "p2"],
    predictions: [
      pred({
        participantId: "p1",
        predictionKind: "group_winner",
        teamId: "t-bra",
        groupCode: "A",
      }),
      pred({
        participantId: "p2",
        predictionKind: "group_winner",
        teamId: "t-arg",
        groupCode: "A",
      }),
      pred({
        participantId: "p3",
        predictionKind: "group_winner",
        teamId: "t-fra",
        groupCode: "B",
      }),
    ],
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
      { id: "p3", display_name: "Incomplete" },
    ],
    teams,
    bonusKeys: [],
    canShowParticipantNames: true,
  });
  const group = incompleteSections.find((s) => s.id === "group")!;
  const brazil = group.teamPicks.find((p) => p.teamName === "Brazil")!;
  assert.deepStrictEqual(brazil.notPickedParticipantNames, ["B"]);
  assert.ok(!brazil.notPickedParticipantNames!.includes("Incomplete"));
}

// Unanimous pick: empty not-picked list
{
  const unanimousSections = resolvePoolPreBracketRevealSections({
    completeParticipantIds: ["p1", "p2"],
    predictions: [
      pred({
        participantId: "p1",
        predictionKind: "bonus_pick",
        teamId: "t-bra",
        bonusKey: "golden_boot",
      }),
      pred({
        participantId: "p2",
        predictionKind: "bonus_pick",
        teamId: "t-bra",
        bonusKey: "golden_boot",
      }),
    ],
    participantRows: [
      { id: "p1", display_name: "A" },
      { id: "p2", display_name: "B" },
    ],
    teams,
    bonusKeys: ["golden_boot"],
    canShowParticipantNames: true,
  });
  const boot = unanimousSections.find((s) => s.id === "bonus")!;
  const brazil = boot.teamPicks.find((p) => p.teamName === "Brazil")!;
  assert.deepStrictEqual(brazil.notPickedParticipantNames, []);
}

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
