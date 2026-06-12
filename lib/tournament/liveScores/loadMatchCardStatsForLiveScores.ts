import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchCardStatsSnapshot, MatchCardSideTotals } from "./types";

type StatRow = {
  match_id: string;
  team_id: string;
  yellow_cards: number | null;
  red_cards: number | null;
  source: string;
};

function emptySide(): MatchCardSideTotals {
  return { yellowCards: null, redCards: null };
}

function sideFromRow(row: StatRow | undefined): MatchCardSideTotals {
  if (!row) return emptySide();
  return {
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
  };
}

export async function loadMatchCardStatsForLiveScores(
  supabase: SupabaseClient,
  editionId: string,
  matchIds: string[],
): Promise<{ statsByMatchId: Map<string, MatchCardStatsSnapshot> } | { error: string }> {
  if (matchIds.length === 0) {
    return { statsByMatchId: new Map() };
  }

  const { data, error } = await supabase
    .from("tournament_match_team_stats")
    .select("match_id, team_id, yellow_cards, red_cards, source")
    .eq("edition_id", editionId)
    .in("match_id", matchIds)
    .in("source", ["manual", "provider"]);

  if (error) return { error: error.message };

  const { data: matches, error: matchErr } = await supabase
    .from("tournament_matches")
    .select("id, home_team_id, away_team_id")
    .eq("edition_id", editionId)
    .in("id", matchIds);

  if (matchErr) return { error: matchErr.message };

  const homeAwayByMatch = new Map<string, { homeTeamId: string; awayTeamId: string }>();
  for (const m of matches ?? []) {
    if (m.home_team_id && m.away_team_id) {
      homeAwayByMatch.set(m.id as string, {
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
      });
    }
  }

  const statsByMatchId = new Map<string, MatchCardStatsSnapshot>();
  for (const matchId of matchIds) {
    statsByMatchId.set(matchId, { manual: null, provider: null });
  }

  for (const row of (data ?? []) as StatRow[]) {
    const teams = homeAwayByMatch.get(row.match_id);
    if (!teams) continue;

    const snapshot = statsByMatchId.get(row.match_id)!;
    const isHome = row.team_id === teams.homeTeamId;
    const isAway = row.team_id === teams.awayTeamId;
    if (!isHome && !isAway) continue;

    if (row.source === "manual") {
      if (!snapshot.manual) {
        snapshot.manual = { home: emptySide(), away: emptySide() };
      }
      if (isHome) snapshot.manual.home = sideFromRow(row);
      else snapshot.manual.away = sideFromRow(row);
    } else if (row.source === "provider") {
      if (!snapshot.provider) {
        snapshot.provider = { home: emptySide(), away: emptySide() };
      }
      if (isHome) snapshot.provider.home = sideFromRow(row);
      else snapshot.provider.away = sideFromRow(row);
    }
  }

  return { statsByMatchId };
}

/** Effective DB card totals for preview display (manual overrides provider per side). */
export function effectiveDbCardTotals(snapshot: MatchCardStatsSnapshot | undefined): {
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
} {
  if (!snapshot) {
    return { homeYellow: null, awayYellow: null, homeRed: null, awayRed: null };
  }

  const pick = (side: "home" | "away", field: "yellowCards" | "redCards"): number | null => {
    const manual = snapshot.manual?.[side][field];
    if (manual != null) return manual;
    return snapshot.provider?.[side][field] ?? null;
  };

  return {
    homeYellow: pick("home", "yellowCards"),
    awayYellow: pick("away", "yellowCards"),
    homeRed: pick("home", "redCards"),
    awayRed: pick("away", "redCards"),
  };
}

export function formatCardTotals(
  homeYellow: number | null,
  awayYellow: number | null,
  homeRed: number | null,
  awayRed: number | null,
): string {
  if (
    homeYellow == null &&
    awayYellow == null &&
    homeRed == null &&
    awayRed == null
  ) {
    return "—";
  }
  const y = `Y ${homeYellow ?? 0}/${awayYellow ?? 0}`;
  const r = `R ${homeRed ?? 0}/${awayRed ?? 0}`;
  return `${y} · ${r}`;
}
