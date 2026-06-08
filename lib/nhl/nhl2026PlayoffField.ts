import type { NhlTeam } from "./types";

/** Input row for inserting `nhl_teams` during Phase 2 setup (logos optional elsewhere). */
export type Nhl2026PlayoffTeamInput = Pick<
  NhlTeam,
  "team_name" | "team_slug" | "abbreviation" | "conference" | "division" | "seed"
>;

/**
 * Official 2026 Stanley Cup Playoffs 16-club field (Eastern / Western conferences).
 * Division + seed values follow the league’s 2026 playoff bracketing (reasonable
 * admin display order; not used for scoring in Phase 2).
 *
 * Source of truth for the field and Round 1 pairings: NHL.com 2026 Stanley Cup
 * Playoffs bracket / first-round schedule (e.g. https://www.nhl.com/playoffs/2026/bracket
 * and the league’s published first-round schedule).
 */
export const NHL_2026_PLAYOFF_TEAMS: Nhl2026PlayoffTeamInput[] = [
  // East — seeds 1–8 for this conference
  {
    team_name: "Carolina Hurricanes",
    team_slug: "hurricanes",
    abbreviation: "CAR",
    conference: "east",
    division: "Metropolitan",
    seed: 1,
  },
  {
    team_name: "Buffalo Sabres",
    team_slug: "sabres",
    abbreviation: "BUF",
    conference: "east",
    division: "Atlantic",
    seed: 2,
  },
  {
    team_name: "Pittsburgh Penguins",
    team_slug: "penguins",
    abbreviation: "PIT",
    conference: "east",
    division: "Metropolitan",
    seed: 3,
  },
  {
    team_name: "Tampa Bay Lightning",
    team_slug: "lightning",
    abbreviation: "TBL",
    conference: "east",
    division: "Atlantic",
    seed: 4,
  },
  {
    team_name: "Philadelphia Flyers",
    team_slug: "flyers",
    abbreviation: "PHI",
    conference: "east",
    division: "Metropolitan",
    seed: 5,
  },
  {
    team_name: "Montreal Canadiens",
    team_slug: "canadiens",
    abbreviation: "MTL",
    conference: "east",
    division: "Atlantic",
    seed: 6,
  },
  {
    team_name: "Boston Bruins",
    team_slug: "bruins",
    abbreviation: "BOS",
    conference: "east",
    division: "Atlantic",
    seed: 7,
  },
  {
    team_name: "Ottawa Senators",
    team_slug: "senators",
    abbreviation: "OTT",
    conference: "east",
    division: "Atlantic",
    seed: 8,
  },
  // West — seeds 1–8 for this conference
  {
    team_name: "Colorado Avalanche",
    team_slug: "avalanche",
    abbreviation: "COL",
    conference: "west",
    division: "Central",
    seed: 1,
  },
  {
    team_name: "Vegas Golden Knights",
    team_slug: "golden-knights",
    abbreviation: "VGK",
    conference: "west",
    division: "Pacific",
    seed: 2,
  },
  {
    team_name: "Edmonton Oilers",
    team_slug: "oilers",
    abbreviation: "EDM",
    conference: "west",
    division: "Pacific",
    seed: 3,
  },
  {
    team_name: "Dallas Stars",
    team_slug: "stars",
    abbreviation: "DAL",
    conference: "west",
    division: "Central",
    seed: 4,
  },
  {
    team_name: "Minnesota Wild",
    team_slug: "wild",
    abbreviation: "MIN",
    conference: "west",
    division: "Central",
    seed: 5,
  },
  {
    team_name: "Anaheim Ducks",
    team_slug: "ducks",
    abbreviation: "ANA",
    conference: "west",
    division: "Pacific",
    seed: 6,
  },
  {
    team_name: "Los Angeles Kings",
    team_slug: "kings",
    abbreviation: "LAK",
    conference: "west",
    division: "Pacific",
    seed: 7,
  },
  {
    team_name: "Utah Mammoth",
    team_slug: "mammoth",
    abbreviation: "UTA",
    conference: "west",
    division: "Central",
    seed: 8,
  },
];

/** Slugs for the official 2026 field (used to detect demo / stale editions). */
export const NHL_2026_OFFICIAL_TEAM_SLUGS: ReadonlySet<string> = new Set(
  NHL_2026_PLAYOFF_TEAMS.map((t) => t.team_slug),
);

/**
 * Round 1 matchups aligned to `buildDefaultBracketSkeleton()` R1 slots:
 * East slots 1–4, then West slots 1–4.
 *
 * `higher_*` / `lower_*` follow NHL bracket convention (higher seed / home-ice club first).
 */
export const NHL_2026_ROUND1_SLOTS: readonly {
  side: "east" | "west";
  slot_index: 1 | 2 | 3 | 4;
  higher_team_slug: string;
  lower_team_slug: string;
}[] = [
  { side: "east", slot_index: 1, higher_team_slug: "sabres", lower_team_slug: "bruins" },
  { side: "east", slot_index: 2, higher_team_slug: "lightning", lower_team_slug: "canadiens" },
  { side: "east", slot_index: 3, higher_team_slug: "penguins", lower_team_slug: "flyers" },
  { side: "east", slot_index: 4, higher_team_slug: "hurricanes", lower_team_slug: "senators" },
  { side: "west", slot_index: 1, higher_team_slug: "stars", lower_team_slug: "wild" },
  { side: "west", slot_index: 2, higher_team_slug: "avalanche", lower_team_slug: "kings" },
  { side: "west", slot_index: 3, higher_team_slug: "oilers", lower_team_slug: "ducks" },
  { side: "west", slot_index: 4, higher_team_slug: "golden-knights", lower_team_slug: "mammoth" },
] as const;
