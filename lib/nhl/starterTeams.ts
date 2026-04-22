import type { NhlTeam } from "./types";

export type StarterTeamInput = Pick<
  NhlTeam,
  "team_name" | "team_slug" | "abbreviation" | "conference" | "division" | "seed"
>;

/**
 * Placeholder playoff field (16 teams) for setup / inspection — not official league data.
 * Seeds are illustrative for bracket ordering in later phases.
 */
export const NHL_STARTER_TEAMS: StarterTeamInput[] = [
  {
    team_name: "Boston Bruins",
    team_slug: "bruins",
    abbreviation: "BOS",
    conference: "east",
    division: "Atlantic",
    seed: 1,
  },
  {
    team_name: "Toronto Maple Leafs",
    team_slug: "maple-leafs",
    abbreviation: "TOR",
    conference: "east",
    division: "Atlantic",
    seed: 2,
  },
  {
    team_name: "Florida Panthers",
    team_slug: "panthers",
    abbreviation: "FLA",
    conference: "east",
    division: "Atlantic",
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
    team_name: "Carolina Hurricanes",
    team_slug: "hurricanes",
    abbreviation: "CAR",
    conference: "east",
    division: "Metropolitan",
    seed: 5,
  },
  {
    team_name: "New York Rangers",
    team_slug: "rangers",
    abbreviation: "NYR",
    conference: "east",
    division: "Metropolitan",
    seed: 6,
  },
  {
    team_name: "Philadelphia Flyers",
    team_slug: "flyers",
    abbreviation: "PHI",
    conference: "east",
    division: "Metropolitan",
    seed: 7,
  },
  {
    team_name: "Washington Capitals",
    team_slug: "capitals",
    abbreviation: "WSH",
    conference: "east",
    division: "Metropolitan",
    seed: 8,
  },
  {
    team_name: "Dallas Stars",
    team_slug: "stars",
    abbreviation: "DAL",
    conference: "west",
    division: "Central",
    seed: 1,
  },
  {
    team_name: "Colorado Avalanche",
    team_slug: "avalanche",
    abbreviation: "COL",
    conference: "west",
    division: "Central",
    seed: 2,
  },
  {
    team_name: "Minnesota Wild",
    team_slug: "wild",
    abbreviation: "MIN",
    conference: "west",
    division: "Central",
    seed: 3,
  },
  {
    team_name: "Winnipeg Jets",
    team_slug: "jets",
    abbreviation: "WPG",
    conference: "west",
    division: "Central",
    seed: 4,
  },
  {
    team_name: "Edmonton Oilers",
    team_slug: "oilers",
    abbreviation: "EDM",
    conference: "west",
    division: "Pacific",
    seed: 5,
  },
  {
    team_name: "Vancouver Canucks",
    team_slug: "canucks",
    abbreviation: "VAN",
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
    team_name: "Vegas Golden Knights",
    team_slug: "golden-knights",
    abbreviation: "VGK",
    conference: "west",
    division: "Pacific",
    seed: 8,
  },
];
