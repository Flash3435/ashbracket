import wc2026Data from "../wc2026Data.json";

/** Strip accents and punctuation for fuzzy team-name comparison. */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ALIASES: Record<string, string> = {
  "korea republic": "korea republic",
  "south korea": "korea republic",
  "korea": "korea republic",
  "usa": "united states",
  "us": "united states",
  "united states of america": "united states",
  "cote divoire": "cote divoire",
  "cote d ivoire": "cote divoire",
  "ivory coast": "cote divoire",
  "ir iran": "ir iran",
  "iran": "ir iran",
  "turkiye": "turkiye",
  "turkey": "turkiye",
  "czech republic": "czechia",
  "curacao": "curacao",
  "dr congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  "congo": "congo dr",
  "bosnia and herzegovina": "bosnia and herzegovina",
  "bosnia herzegovina": "bosnia and herzegovina",
  "saudi arabia": "saudi arabia",
  "new zealand": "new zealand",
  "south africa": "south africa",
  "cabo verde": "cabo verde",
  "cape verde": "cabo verde",
};

export function canonicalTeamName(name: string): string {
  const normalized = normalizeTeamName(name);
  return ALIASES[normalized] ?? normalized;
}

type Wc2026Teams = Record<string, string>;

function buildNameToFifaCodeMap(): Map<string, string> {
  const teams = (wc2026Data as { teams: Wc2026Teams }).teams;
  const map = new Map<string, string>();
  for (const [fifaCode, displayName] of Object.entries(teams)) {
    map.set(canonicalTeamName(displayName), fifaCode);
    map.set(canonicalTeamName(fifaCode), fifaCode);
  }
  return map;
}

const NAME_TO_FIFA = buildNameToFifaCodeMap();

export function fifaCodeFromTeamName(name: string): string | null {
  return NAME_TO_FIFA.get(canonicalTeamName(name)) ?? null;
}

export function teamNamesMatch(a: string, b: string): boolean {
  const ca = canonicalTeamName(a);
  const cb = canonicalTeamName(b);
  if (ca === cb) return true;
  const fa = fifaCodeFromTeamName(a);
  const fb = fifaCodeFromTeamName(b);
  return fa != null && fa === fb;
}
