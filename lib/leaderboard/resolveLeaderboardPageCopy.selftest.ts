import { LEADERBOARD_AWARDED_POINTS_NOTE } from "./buildPoolStandingsFromLedger";
import {
  LEADERBOARD_ACTIVE_SUBTITLE,
  LEADERBOARD_PAGE_TITLE,
  STANDINGS_WARMING_UP_HEADLINE,
  STANDINGS_WARMING_UP_PAGE_SUBTITLE,
} from "./leaderboardPageCopy";
import {
  leaderboardHasAwardedPoints,
  resolveLeaderboardPageCopy,
} from "./resolveLeaderboardPageCopy";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

const activeCopy = resolveLeaderboardPageCopy({
  picksLocked: true,
  hasAwardedPoints: true,
  showBracketOutlook: false,
});
t(activeCopy.title === LEADERBOARD_PAGE_TITLE, "awarded points use Leaderboard title");
t(
  activeCopy.description === LEADERBOARD_ACTIVE_SUBTITLE,
  "awarded points use active standings subtitle",
);
t(
  !activeCopy.description.includes("Official points have not landed yet"),
  "nonzero standings do not render official-points-not-landed copy",
);
t(
  !activeCopy.description.includes("meaningful race"),
  "active standings avoid meaningful-race language",
);

const knockoutWithPoints = resolveLeaderboardPageCopy({
  picksLocked: true,
  hasAwardedPoints: true,
  showBracketOutlook: false,
});
t(
  knockoutWithPoints.title === "Leaderboard" &&
    knockoutWithPoints.description.includes("Knockout results"),
  "knockout stage with standings rows renders active leaderboard copy",
);

const warmingCopy = resolveLeaderboardPageCopy({
  picksLocked: true,
  hasAwardedPoints: false,
  showBracketOutlook: false,
});
t(
  warmingCopy.title === STANDINGS_WARMING_UP_HEADLINE,
  "zero-point pre-scoring state uses warming-up title",
);
t(
  warmingCopy.description === STANDINGS_WARMING_UP_PAGE_SUBTITLE,
  "zero-point pre-scoring state uses warming-up subtitle",
);
t(
  !warmingCopy.description.includes("meaningful race"),
  "warming-up copy avoids meaningful-race language",
);

const outlookCopy = resolveLeaderboardPageCopy({
  picksLocked: true,
  hasAwardedPoints: false,
  showBracketOutlook: true,
});
t(outlookCopy.title === "Bracket Outlook", "bracket outlook keeps outlook title when separated");
t(
  outlookCopy.description.includes("Unofficial early read"),
  "bracket outlook keeps unofficial intro",
);

t(
  leaderboardHasAwardedPoints({
    hasAwardedPointsFlag: true,
    standingsRows: [{ totalPoints: 0 }],
  }),
  "ledger flag marks awarded points even when row totals are zero",
);
t(
  leaderboardHasAwardedPoints({
    standingsRows: [
      { totalPoints: 0 },
      { totalPoints: 12 },
    ],
  }),
  "standings rows with points count as awarded",
);
t(
  !leaderboardHasAwardedPoints({
    standingsRows: [{ totalPoints: 0 }, { totalPoints: 0 }],
  }),
  "all-zero standings rows are not awarded",
);

t(
  LEADERBOARD_AWARDED_POINTS_NOTE === LEADERBOARD_ACTIVE_SUBTITLE,
  "post-lock intro matches active leaderboard subtitle",
);

if (failed > 0) process.exit(1);
console.log("resolveLeaderboardPageCopy.selftest: ok");
