/**
 * Top-10 draft order for the 2026 NHL Draft Pick'em (team holding each pick).
 * Update if lottery/trades change slot ownership before draft day.
 */
export type NhlDraft26PickSlot = {
  pickNumber: number;
  teamName: string;
  /** Shown in UI (e.g. SJS). */
  teamAbbreviation: string;
  /** Key for shared NHL logo lookup — must match `nhlTeamLogoRegistry` (NHL CDN abbrev). */
  logoTeamKey: string;
  /** Matches `public/nhl/logos/{slug}.svg`. */
  teamSlug: string;
  logoPath?: string;
  pickLabel?: string;
};

export const NHL_DRAFT26_TOP10_ORDER: NhlDraft26PickSlot[] = [
  {
    pickNumber: 1,
    teamName: "Toronto Maple Leafs",
    teamAbbreviation: "TOR",
    logoTeamKey: "TOR",
    teamSlug: "maple-leafs",
    pickLabel: "Pick 1",
  },
  {
    pickNumber: 2,
    teamName: "San Jose Sharks",
    teamAbbreviation: "SJS",
    logoTeamKey: "SJS",
    teamSlug: "sharks",
    pickLabel: "Pick 2",
  },
  {
    pickNumber: 3,
    teamName: "Vancouver Canucks",
    teamAbbreviation: "VAN",
    logoTeamKey: "VAN",
    teamSlug: "canucks",
    pickLabel: "Pick 3",
  },
  {
    pickNumber: 4,
    teamName: "Chicago Blackhawks",
    teamAbbreviation: "CHI",
    logoTeamKey: "CHI",
    teamSlug: "blackhawks",
    pickLabel: "Pick 4",
  },
  {
    pickNumber: 5,
    teamName: "New York Rangers",
    teamAbbreviation: "NYR",
    logoTeamKey: "NYR",
    teamSlug: "rangers",
    pickLabel: "Pick 5",
  },
  {
    pickNumber: 6,
    teamName: "Calgary Flames",
    teamAbbreviation: "CGY",
    logoTeamKey: "CGY",
    teamSlug: "flames",
    pickLabel: "Pick 6",
  },
  {
    pickNumber: 7,
    teamName: "Seattle Kraken",
    teamAbbreviation: "SEA",
    logoTeamKey: "SEA",
    teamSlug: "kraken",
    pickLabel: "Pick 7",
  },
  {
    pickNumber: 8,
    teamName: "Winnipeg Jets",
    teamAbbreviation: "WPG",
    logoTeamKey: "WPG",
    teamSlug: "jets",
    pickLabel: "Pick 8",
  },
  {
    pickNumber: 9,
    teamName: "Florida Panthers",
    teamAbbreviation: "FLA",
    logoTeamKey: "FLA",
    teamSlug: "panthers",
    pickLabel: "Pick 9",
  },
  {
    pickNumber: 10,
    teamName: "Nashville Predators",
    teamAbbreviation: "NSH",
    logoTeamKey: "NSH",
    teamSlug: "predators",
    pickLabel: "Pick 10",
  },
];

export function getNhlDraft26Top10PickSlots(): NhlDraft26PickSlot[] {
  return NHL_DRAFT26_TOP10_ORDER;
}

export function getNhlDraft26PickSlot(
  pickNumber: number,
): NhlDraft26PickSlot | undefined {
  return NHL_DRAFT26_TOP10_ORDER.find((s) => s.pickNumber === pickNumber);
}
