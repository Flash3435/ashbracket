/**
 * Very light-touch labels for casual pickers — not ratings, just conversation-level hints.
 */
export type TeamStrengthLabel = "Often picked" | "Solid" | "Wild card";

const OFTEN = new Set(
  [
    "BRA",
    "ARG",
    "FRA",
    "GER",
    "ESP",
    "ENG",
    "POR",
    "NED",
    "BEL",
  ].map((c) => c),
);

const SOLID = new Set(
  [
    "USA",
    "MEX",
    "URU",
    "CRO",
    "COL",
    "MAR",
    "SUI",
    "JPN",
    "KOR",
    "AUS",
    "CAN",
    "ECU",
    "DEN",
    "ITA",
    "UKR",
    "POL",
    "AUT",
    "TUR",
    "SRB",
    "WAL",
    "SCO",
    "NOR",
    "SEN",
    "GHA",
    "IRN",
    "ALG",
    "RSA",
    "EGY",
    "PAR",
    "SWE",
    "QAT",
    "CZE",
    "HUN",
    "ROU",
    "CHI",
    "PER",
    "NGA",
    "CIV",
    "TUN",
    "JAM",
    "NZL",
    "CPV",
    "KSA",
    "IRQ",
    "JOR",
    "UZB",
    "COD",
    "PAN",
    "HAI",
    "CUW",
    "BIH",
  ],
);

export function teamStrengthLabel(countryCode: string): TeamStrengthLabel {
  const u = countryCode.trim().toUpperCase();
  if (OFTEN.has(u)) return "Often picked";
  if (SOLID.has(u)) return "Solid";
  return "Wild card";
}

export function strengthLabelHint(label: TeamStrengthLabel): string {
  switch (label) {
    case "Often picked":
      return "Usually among the names you hear a lot before a big tournament.";
    case "Solid":
      return "Can surprise people — not a wild long shot.";
    case "Wild card":
      return "Could be a fun upset pick — less often chosen.";
    default:
      return "";
  }
}
