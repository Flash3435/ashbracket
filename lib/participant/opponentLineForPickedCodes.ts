import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

function label(name: string | null, code: string | null): string {
  if (name) return name;
  if (code) return code;
  return "TBD";
}

/**
 * Short opponent description for a participant’s picked national teams.
 */
export function opponentLineForPickedCodes(
  m: TournamentMatchPublicRow,
  pickedCodes: Set<string>,
): string {
  const h = normCode(m.home_country_code);
  const a = normCode(m.away_country_code);
  const homePicked = Boolean(h && pickedCodes.has(h));
  const awayPicked = Boolean(a && pickedCodes.has(a));

  if (homePicked && awayPicked) {
    return "Your picks face each other";
  }
  if (homePicked) {
    return `vs ${label(m.away_team_name, m.away_country_code)}`;
  }
  if (awayPicked) {
    return `vs ${label(m.home_team_name, m.home_country_code)}`;
  }
  return "";
}
