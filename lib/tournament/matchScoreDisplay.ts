import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

/** Finished or live score line for public tournament rows. */
export function formatTournamentMatchScoreLine(m: TournamentMatchPublicRow): string {
  if (m.status !== "finished" && m.status !== "live") return "—";
  if (m.home_goals == null || m.away_goals == null) return "—";
  let s = `${m.home_goals} – ${m.away_goals}`;
  if (
    m.home_penalties != null &&
    m.away_penalties != null &&
    m.home_goals === m.away_goals
  ) {
    s += ` (${m.home_penalties}–${m.away_penalties} pens)`;
  }
  return s;
}

export function isFinishedMatchWithScores(m: TournamentMatchPublicRow): boolean {
  if (m.status !== "finished") return false;
  if (m.home_goals == null || m.away_goals == null) return false;
  const home = (m.home_country_code ?? "").trim();
  const away = (m.away_country_code ?? "").trim();
  return home.length > 0 && away.length > 0;
}
