export const LEADERBOARD_PAGE_TITLE = "Leaderboard";

export const LEADERBOARD_ACTIVE_SUBTITLE =
  "Standings are based on points awarded so far. Knockout results can still create big swings as brackets stay alive or get eliminated.";

export const STANDINGS_WARMING_UP_HEADLINE = "Standings are warming up";

export const STANDINGS_WARMING_UP_PAGE_SUBTITLE =
  "Standings will open up once results start producing points.";

/** Full-page warming state (pre-points, results underway but clustered). */
export const STANDINGS_WARMING_UP_BODY = STANDINGS_WARMING_UP_PAGE_SUBTITLE;

/** Compact dashboard / matchday card note in the same pre-points state. */
export const STANDINGS_WARMING_UP_DASHBOARD_NOTE = STANDINGS_WARMING_UP_PAGE_SUBTITLE;

export const LEADERBOARD_STANDINGS_SUBTITLE_WITH_MOMENTUM =
  "Ranked by awarded points. Arrows show recent rank movement after the latest scoring update.";

export const LEADERBOARD_STANDINGS_SUBTITLE_WITH_RACE_OUTLOOK =
  "Ranked by awarded points. Tap a participant to see their picks and race outlook.";

export function resolveLeaderboardStandingsSubtitle(input: {
  hasMomentum: boolean;
  hasRaceOutlook: boolean;
  participantCount: number;
}): string {
  if (input.hasMomentum) {
    return LEADERBOARD_STANDINGS_SUBTITLE_WITH_MOMENTUM;
  }
  if (input.hasRaceOutlook) {
    return LEADERBOARD_STANDINGS_SUBTITLE_WITH_RACE_OUTLOOK;
  }
  return `${input.participantCount} ${input.participantCount === 1 ? "entry" : "entries"} ranked by awarded points. Tied totals share the same rank.`;
}
