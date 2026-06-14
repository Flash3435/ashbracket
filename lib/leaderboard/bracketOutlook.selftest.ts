import {
  buildParticipantTeamPicksFromPredictions,
} from "@/lib/poolActivity/scoreImpact/buildSoftImpact";
import {
  BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS,
  buildBracketOutlook,
  compareBracketOutlookEntries,
  formatBracketOutlookResultLine,
  toClientSafeBracketOutlookEntries,
} from "./buildBracketOutlook";
import { shouldShowBracketOutlook } from "./bracketOutlookVisibility";
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

const completedMatches = [
  { matchCode: "G-A-1", winnerTeamId: "usa" },
  { matchCode: "G-A-2", winnerTeamId: "bra" },
  { matchCode: "G-B-1", winnerTeamId: "bra" },
  { matchCode: "G-B-2", winnerTeamId: "jpn" },
  { matchCode: "G-C-1", winnerTeamId: "mex" },
];

const outlook = buildBracketOutlook({
  participantPicks: pathPicks,
  participantNames,
  completedGroupMatches: completedMatches,
  teamNameById: teamNames,
});

t(outlook != null, "outlook computed when results exist");
t(outlook!.entries.length === 3, "bonus-only participant excluded from outlook");

const ash = outlook!.entries.find((e) => e.displayName === "Ash");
const nish = outlook!.entries.find((e) => e.displayName === "Nish");
const flash = outlook!.entries.find((e) => e.displayName === "Flash");

t(ash?.helpedMatchCount === 4, "Ash gets four helpful results");
t(nish?.helpedMatchCount === 3, "Nish gets three helpful results");
t(flash?.helpedMatchCount === 3, "Flash gets three helpful results");
t((ash?.helpedTeamCount ?? 0) === 3, "Ash helped three path teams");

t(
  shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: false,
    outlook,
    completedMatchCount: completedMatches.length,
  }),
  "outlook visible when locked, no points, and meaningful",
);
t(
  !shouldShowBracketOutlook({
    picksLocked: false,
    hasAwardedPoints: false,
    outlook,
    completedMatchCount: completedMatches.length,
  }),
  "outlook hidden before lock",
);
t(
  !shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: true,
    outlook,
    completedMatchCount: completedMatches.length,
  }),
  "outlook hidden once official points exist",
);
t(
  !shouldShowBracketOutlook({
    picksLocked: true,
    hasAwardedPoints: false,
    outlook: null,
    completedMatchCount: 0,
  }),
  "no completed results shows waiting state",
);

const drawOnly = buildBracketOutlook({
  participantPicks: pathPicks,
  participantNames,
  completedGroupMatches: [{ matchCode: "G-D-1", winnerTeamId: "" }],
  teamNameById: teamNames,
});
t(drawOnly == null, "empty winner omitted");

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

const sorted = [...(outlook?.entries ?? [])].sort(compareBracketOutlookEntries);
t(sorted[0]?.displayName === "Ash", "deterministic sorting puts Ash first");
t(sorted[1]?.displayName === "Flash", "Flash ranks above Nish on path importance tie-break");
t(sorted[2]?.displayName === "Nish", "Nish follows Flash when match counts tie");

const clientSafe = toClientSafeBracketOutlookEntries(outlook!);
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
  formatBracketOutlookResultLine(clientSafe[0]!).includes("helpful result"),
  "display copy uses helpful results wording",
);
t(
  !formatBracketOutlookResultLine(clientSafe[0]!).includes("point"),
  "display copy avoids points wording",
);

const outlookNav = resolveStandingsNav({
  poolId: "pool-1",
  isPublic: false,
  participantId: "part-1",
  picksLocked: true,
  hasAwardedPoints: false,
});
t(outlookNav.label === "Outlook", "nav label is Outlook before points");
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
t(
  leaderboardNav.href === "/pool/pool-1",
  "public pool nav href unchanged after points",
);

if (failed > 0) process.exit(1);
console.log("bracketOutlook.selftest: ok");
