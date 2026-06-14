import {
  buildParticipantTeamPicksFromPredictions,
} from "@/lib/poolActivity/scoreImpact/buildSoftImpact";
import {
  BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS,
  buildBracketOutlook,
  compareBracketOutlookEntries,
  formatBracketOutlookDetailLine,
  toClientSafeBracketOutlookEntries,
} from "./buildBracketOutlook";
import {
  bracketOutlookHasMeaningfulSeparation,
  computeBracketOutlookDistribution,
  formatMedianOutlookLine,
  formatTopOutlookGroupLine,
  MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
} from "./bracketOutlookSeparation";
import {
  evaluateBracketOutlookVisibility,
  shouldShowBracketOutlook,
  shouldShowStandingsWarmingNote,
} from "./bracketOutlookVisibility";
import { resolveStandingsNav } from "../pool/leaderboardNavHref";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

const teamNames = new Map([
  ["usa", "United States"],
  ["bra", "Brazil"],
  ["jpn", "Japan"],
  ["mex", "Mexico"],
  ["fra", "France"],
  ["ger", "Germany"],
  ["esp", "Spain"],
  ["arg", "Argentina"],
]);

const participantNames = new Map([
  ["p-ash", "Ash"],
  ["p-nish", "Nish"],
  ["p-flash", "Flash"],
  ["p-quiet", "Quiet"],
]);

function picks(
  rows: Array<{ participantId: string; teamId: string; predictionKind: string }>,
) {
  return buildParticipantTeamPicksFromPredictions(rows);
}

const pathPicks = picks([
  { participantId: "p-ash", teamId: "usa", predictionKind: "group_winner" },
  { participantId: "p-ash", teamId: "bra", predictionKind: "quarterfinalist" },
  { participantId: "p-ash", teamId: "jpn", predictionKind: "round_of_16" },
  { participantId: "p-nish", teamId: "bra", predictionKind: "group_winner" },
  { participantId: "p-nish", teamId: "mex", predictionKind: "group_runner_up" },
  { participantId: "p-flash", teamId: "bra", predictionKind: "semifinalist" },
  { participantId: "p-flash", teamId: "jpn", predictionKind: "group_winner" },
  { participantId: "p-quiet", teamId: "mex", predictionKind: "bonus_pick" },
]);

const sixMatches = [
  { matchCode: "G-A-1", winnerTeamId: "usa" },
  { matchCode: "G-A-2", winnerTeamId: "bra" },
  { matchCode: "G-B-1", winnerTeamId: "bra" },
  { matchCode: "G-B-2", winnerTeamId: "jpn" },
  { matchCode: "G-C-1", winnerTeamId: "mex" },
  { matchCode: "G-C-2", winnerTeamId: "fra" },
];

const fiveMatches = sixMatches.slice(0, 5);

const outlookSix = buildBracketOutlook({
  participantPicks: pathPicks,
  participantNames,
  completedGroupMatches: sixMatches,
  teamNameById: teamNames,
});

const outlookFive = buildBracketOutlook({
  participantPicks: pathPicks,
  participantNames,
  completedGroupMatches: fiveMatches,
  teamNameById: teamNames,
});

t(outlookSix != null, "outlook computed when results exist");
t(outlookFive != null, "outlook computed with five matches");

t(
  !shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: false,
    outlook: outlookFive,
    completedMatchCount: fiveMatches.length,
    totalParticipantCount: 4,
  }),
  "outlook hidden when fewer than 6 decisive matches",
);

function syntheticOutlook(scores: number[]) {
  return {
    entries: scores.map((score, index) => ({
      participantId: `p-${index}`,
      displayName: `Player ${index + 1}`,
      helpedMatchCount: score,
      helpedTeamCount: score,
      maxHelpedPathImportance: 10,
      topHelpedTeamNames: [],
    })),
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
  };
}

const clustered42 = syntheticOutlook([
  ...Array(30).fill(4),
  ...Array(12).fill(3),
]);
t(
  !bracketOutlookHasMeaningfulSeparation({
    outlook: clustered42,
    totalParticipantCount: 42,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
  }),
  "outlook hidden when more than 50% tied at top and top-vs-median gap < 2",
);
t(
  !shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: false,
    outlook: clustered42,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
    totalParticipantCount: 42,
  }),
  "direct route shows waiting state when outlook is clustered",
);

const clearLeader = syntheticOutlook([8, ...Array(9).fill(4)]);
t(
  bracketOutlookHasMeaningfulSeparation({
    outlook: clearLeader,
    totalParticipantCount: 10,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
  }),
  "outlook shown when top score is at least 2 above median",
);

const halfTiedTop = syntheticOutlook([
  ...Array(5).fill(7),
  ...Array(5).fill(3),
]);
t(
  bracketOutlookHasMeaningfulSeparation({
    outlook: halfTiedTop,
    totalParticipantCount: 10,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
  }),
  "outlook shown when top tie share is at or below 50%",
);

const visibilityShown = evaluateBracketOutlookVisibility({
  picksLocked: true,
  hasAwardedPoints: false,
  outlook: clearLeader,
  completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
  totalParticipantCount: 10,
});
t(visibilityShown.showOutlook, "evaluate visibility shows outlook when separated");
t(
  visibilityShown.distribution != null &&
    formatTopOutlookGroupLine(visibilityShown.distribution).includes(
      "Top outlook group",
    ),
  "distribution summary renders when outlook is shown",
);
t(
  visibilityShown.distribution != null &&
    formatMedianOutlookLine(visibilityShown.distribution).includes("Median outlook"),
  "median outlook line renders when outlook is shown",
);

t(
  !shouldShowBracketOutlook({
    picksLocked: false,
    hasAwardedPoints: false,
    outlook: clearLeader,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
    totalParticipantCount: 10,
  }),
  "outlook hidden before lock",
);
t(
  !shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: true,
    outlook: clearLeader,
    completedMatchCount: MIN_DECISIVE_MATCHES_FOR_OUTLOOK,
    totalParticipantCount: 10,
  }),
  "official points still switch to Leaderboard regardless of Outlook",
);

t(
  shouldShowStandingsWarmingNote({
    picksLocked: true,
    hasAwardedPoints: false,
    completedMatchCount: 4,
    showOutlook: false,
  }),
  "dashboard warming note when clustered pre-points results exist",
);

const winnerHelps = buildBracketOutlook({
  participantPicks: picks([
    { participantId: "p-ash", teamId: "usa", predictionKind: "group_winner" },
  ]),
  participantNames: new Map([["p-ash", "Ash"]]),
  completedGroupMatches: [{ matchCode: "G-A-1", winnerTeamId: "usa" }],
  teamNameById: teamNames,
});
t(
  winnerHelps?.entries[0]?.helpedMatchCount === 1,
  "winner result helps participants with winner in path",
);

const duplicateTeamPicks = buildBracketOutlook({
  participantPicks: picks([
    { participantId: "p-ash", teamId: "bra", predictionKind: "group_winner" },
    { participantId: "p-ash", teamId: "bra", predictionKind: "champion" },
  ]),
  participantNames: new Map([["p-ash", "Ash"]]),
  completedGroupMatches: [{ matchCode: "G-A-2", winnerTeamId: "bra" }],
  teamNameById: teamNames,
});
t(
  duplicateTeamPicks?.entries[0]?.helpedMatchCount === 1,
  "multiple picks for same team do not double-count same match",
);

const sorted = [...(outlookSix?.entries ?? [])].sort(compareBracketOutlookEntries);
t(sorted[0]?.displayName === "Ash", "deterministic sorting puts Ash first");

const clientSafe = toClientSafeBracketOutlookEntries(clearLeader);
t(
  clientSafe.every(
    (row) =>
      !("participantId" in row) &&
      !("topHelpedTeamNames" in row) &&
      typeof row.displayName === "string",
  ),
  "no emails/internal IDs or team names in client-safe rows",
);
t(
  clientSafe.slice(0, BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS).length <= 5,
  "max 5 dashboard rows enforced by slice constant",
);
t(
  formatBracketOutlookDetailLine(clientSafe[0]!).includes("helpful result"),
  "row copy uses neutral helpful-result counts",
);
t(
  !formatBracketOutlookDetailLine(clientSafe[0]!).includes("looking strong"),
  "row copy no longer says every participant is looking strong",
);

const hiddenNav = resolveStandingsNav({
  poolId: "pool-1",
  isPublic: false,
  participantId: "part-1",
  picksLocked: true,
  hasAwardedPoints: false,
  outlookHasMeaningfulSeparation: false,
});
t(hiddenNav.href === null && hiddenNav.label === null, "nav hides Outlook when not meaningful");

const outlookNav = resolveStandingsNav({
  poolId: "pool-1",
  isPublic: false,
  participantId: "part-1",
  picksLocked: true,
  hasAwardedPoints: false,
  outlookHasMeaningfulSeparation: true,
});
t(outlookNav.label === "Outlook", "nav shows Outlook when meaningful");
t(
  outlookNav.href?.includes("/account/leaderboard") === true,
  "private outlook uses account leaderboard route",
);

const leaderboardNav = resolveStandingsNav({
  poolId: "pool-1",
  isPublic: true,
  participantId: "part-1",
  picksLocked: true,
  hasAwardedPoints: true,
});
t(leaderboardNav.label === "Leaderboard", "nav label is Leaderboard after points");

const dist = computeBracketOutlookDistribution(clearLeader, 10);
t(dist.topScore === 8 && dist.topTieCount === 1, "distribution captures top group");

if (failed > 0) process.exit(1);
console.log("bracketOutlook.selftest: ok");
