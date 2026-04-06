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
 * Past `scheduled` fixtures (kickoff before `now`) are omitted unless `includePastScheduled`.
 */
export function nextMatchesForTeamCountryCodes(
  matches: TournamentMatchPublicRow[],
  codes: Set<string>,
  limit = 8,
  options?: { nowMs?: number; includePastScheduled?: boolean },
): TournamentMatchPublicRow[] {
  if (codes.size === 0) return [];

  const nowMs = options?.nowMs ?? Date.now();
  const includePastScheduled = options?.includePastScheduled ?? false;

  const kickMs = (iso: string | null | undefined) => {
    if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };

  const relevant = matches.filter((m) => {
    if (!matchInvolvesCodes(m, codes)) return false;
    if (m.status === "live" || m.status === "postponed") return true;
    if (m.status === "scheduled") {
      if (includePastScheduled) return true;
      const t = kickMs(m.kickoff_at);
      return t === Number.POSITIVE_INFINITY || t >= nowMs;
    }
    return false;
  });

  return [...relevant]
    .sort((a, b) => {
      const liveRank = (s: string) => (s === "live" ? 0 : 1);
      const lr = liveRank(a.status) - liveRank(b.status);
      if (lr !== 0) return lr;
      return kickMs(a.kickoff_at) - kickMs(b.kickoff_at);
    })
    .slice(0, limit);
}
