/**
 * Top-10 draft order for the 2026 NHL Draft Pick'em (team holding each pick).
 * Update if lottery/trades change slot ownership before draft day.
 */
export type NhlDraft26PickSlot = {
  pickNumber: number;
  teamName: string;
  teamAbbreviation: string;
  /** Matches `public/nhl/logos/{slug}.svg` when a local asset exists. */
  teamSlug?: string;
  logoPath?: string;
  pickLabel?: string;
};

export const NHL_DRAFT26_TOP10_ORDER: NhlDraft26PickSlot[] = [
  {
    pickNumber: 1,
    teamName: "Toronto Maple Leafs",
    teamAbbreviation: "TOR",
    teamSlug: "maple-leafs",
    pickLabel: "Pick 1",
  },
  {
    pickNumber: 2,
    teamName: "San Jose Sharks",
    teamAbbreviation: "SJS",
    teamSlug: "sharks",
    pickLabel: "Pick 2",
  },
  {
    pickNumber: 3,
    teamName: "Vancouver Canucks",
    teamAbbreviation: "VAN",
    teamSlug: "canucks",
    pickLabel: "Pick 3",
  },
  {
    pickNumber: 4,
    teamName: "Chicago Blackhawks",
    teamAbbreviation: "CHI",
    teamSlug: "blackhawks",
    pickLabel: "Pick 4",
  },
  {
    pickNumber: 5,
    teamName: "New York Rangers",
    teamAbbreviation: "NYR",
    teamSlug: "rangers",
    pickLabel: "Pick 5",
  },
  {
    pickNumber: 6,
    teamName: "Calgary Flames",
    teamAbbreviation: "CGY",
    teamSlug: "flames",
    pickLabel: "Pick 6",
  },
  {
    pickNumber: 7,
    teamName: "Seattle Kraken",
    teamAbbreviation: "SEA",
    teamSlug: "kraken",
    pickLabel: "Pick 7",
  },
  {
    pickNumber: 8,
    teamName: "Winnipeg Jets",
    teamAbbreviation: "WPG",
    teamSlug: "jets",
    pickLabel: "Pick 8",
  },
  {
    pickNumber: 9,
    teamName: "Florida Panthers",
    teamAbbreviation: "FLA",
    teamSlug: "panthers",
    pickLabel: "Pick 9",
  },
  {
    pickNumber: 10,
    teamName: "Nashville Predators",
    teamAbbreviation: "NSH",
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
