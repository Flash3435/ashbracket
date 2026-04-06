import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

/**
 * FIFA country codes for every team currently selected in knockout pick slots.
 */
export function countryCodesFromKnockoutSlots(
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
): Set<string> {
  const out = new Set<string>();
  for (const s of slots) {
    const id = s.teamId.trim();
    if (!id) continue;
    const t = teamById.get(id);
    const code = t ? normCode(t.countryCode) : null;
    if (code) out.add(code);
  }
  return out;
}

function matchInvolvesCodes(
  m: TournamentMatchPublicRow,
  codes: Set<string>,
): boolean {
  const h = normCode(m.home_country_code);
  const a = normCode(m.away_country_code);
  return Boolean(
    (h && codes.has(h)) || (a && codes.has(a)),
  );
}

/**
 * Upcoming or live matches that include at least one of the given national teams
 * (by FIFA country code). Sorted: live first, then by kickoff time.
 */
export function nextMatchesForTeamCountryCodes(
  matches: TournamentMatchPublicRow[],
  codes: Set<string>,
  limit = 8,
): TournamentMatchPublicRow[] {
  if (codes.size === 0) return [];

  const relevant = matches.filter(
    (m) =>
      matchInvolvesCodes(m, codes) &&
      (m.status === "scheduled" ||
        m.status === "postponed" ||
        m.status === "live"),
  );

  const kickMs = (iso: string | null | undefined) => {
    if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };

  return [...relevant]
    .sort((a, b) => {
      const liveRank = (s: string) => (s === "live" ? 0 : 1);
      const lr = liveRank(a.status) - liveRank(b.status);
      if (lr !== 0) return lr;
      return kickMs(a.kickoff_at) - kickMs(b.kickoff_at);
    })
    .slice(0, limit);
}
