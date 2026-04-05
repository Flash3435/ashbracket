/**
 * Map FIFA three-letter codes (as stored in `teams.country_code`) to ISO 3166-1 alpha-2
 * for regional-indicator flag emoji. Missing entries fall back to no flag (caller shows a placeholder).
 */
const FIFA_TO_ISO2: Record<string, string> = {
  MEX: "MX",
  CZE: "CZ",
  RSA: "ZA",
  KOR: "KR",
  CAN: "CA",
  BIH: "BA",
  QAT: "QA",
  SUI: "CH",
  BRA: "BR",
  HAI: "HT",
  MAR: "MA",
  USA: "US",
  AUS: "AU",
  PAR: "PY",
  TUR: "TR",
  GER: "DE",
  CUW: "CW",
  CIV: "CI",
  ECU: "EC",
  NED: "NL",
  JPN: "JP",
  SWE: "SE",
  TUN: "TN",
  BEL: "BE",
  EGY: "EG",
  IRN: "IR",
  NZL: "NZ",
  ESP: "ES",
  CPV: "CV",
  KSA: "SA",
  URU: "UY",
  FRA: "FR",
  NOR: "NO",
  SEN: "SN",
  IRQ: "IQ",
  ARG: "AR",
  ALG: "DZ",
  AUT: "AT",
  JOR: "JO",
  POR: "PT",
  COD: "CD",
  UZB: "UZ",
  COL: "CO",
  ENG: "GB",
  CRO: "HR",
  GHA: "GH",
  PAN: "PA",
};

/** Scotland has no single ISO alpha-2; show a neutral globe in the flag helper. */
export const FIFA_CODES_WITHOUT_ISO2_FLAG = new Set(["SCO"]);

export function iso2ForFifaCode(fifaCode: string): string | null {
  const u = fifaCode.trim().toUpperCase();
  if (FIFA_CODES_WITHOUT_ISO2_FLAG.has(u)) return null;
  if (u.length === 2) return u;
  return FIFA_TO_ISO2[u] ?? null;
}

export function flagEmojiFromIso2(iso2: string): string {
  const c = iso2.toUpperCase();
  if (c.length !== 2) return "";
  const A = 0x1f1e6;
  const cp1 = A + (c.charCodeAt(0) - 65);
  const cp2 = A + (c.charCodeAt(1) - 65);
  if (cp1 < A || cp1 > A + 25 || cp2 < A || cp2 > A + 25) return "";
  return String.fromCodePoint(cp1, cp2);
}

/** Flag emoji for a team row, or empty string (use a text fallback in UI). */
export function flagEmojiForFifaCountryCode(countryCode: string): string {
  const iso2 = iso2ForFifaCode(countryCode);
  if (!iso2) return "";
  return flagEmojiFromIso2(iso2);
}
