import { NHL_2026_PLAYOFF_TEAMS, NHL_2026_ROUND1_SLOTS } from "./nhl2026PlayoffField";
import type { NhlSeries, NhlSeriesRow } from "./types";

const NHLE_PLAYOFF_BRACKET = "https://api-web.nhle.com/v1/playoff-bracket";

type NhleTeamRef = {
  id?: number;
  abbrev?: string;
};

type NhleSeriesItem = {
  seriesAbbrev?: string;
  playoffRound?: number;
  topSeedWins?: number;
  bottomSeedWins?: number;
  winningTeamId?: number;
  topSeedTeam?: NhleTeamRef | null;
  bottomSeedTeam?: NhleTeamRef | null;
};

function abbreviationForSlug(slug: string): string | null {
  return NHL_2026_PLAYOFF_TEAMS.find((t) => t.team_slug === slug)?.abbreviation ?? null;
}

function winningAbbrev(api: NhleSeriesItem): string | null {
  const w = api.winningTeamId;
  const top = api.topSeedTeam;
  const bot = api.bottomSeedTeam;
  if (w == null || w < 1 || !top?.abbrev || !bot?.abbrev || top.id == null || bot.id == null) {
    return null;
  }
  if (w === top.id) return top.abbrev;
  if (w === bot.id) return bot.abbrev;
  return null;
}

function mapWinsToHigherLower(
  hiAbbr: string,
  loAbbr: string,
  topAbbr: string,
  bottomAbbr: string,
  topWins: number,
  bottomWins: number,
): { hi: number; lo: number } | null {
  if (hiAbbr === topAbbr && loAbbr === bottomAbbr) {
    return { hi: topWins, lo: bottomWins };
  }
  if (hiAbbr === bottomAbbr && loAbbr === topAbbr) {
    return { hi: bottomWins, lo: topWins };
  }
  return null;
}

function inferStatus(winsHi: number, winsLo: number, hasWinnerId: boolean): NhlSeries["status"] {
  if (hasWinnerId) return "complete";
  if (winsHi + winsLo > 0) return "in_progress";
  return "pending";
}

function filterR1Items(apiList: NhleSeriesItem[]): NhleSeriesItem[] {
  return apiList.filter((s) => {
    const ab = (x: string | undefined) => (x ?? "").trim().toUpperCase();
    const pr = s.playoffRound == null ? NaN : Number(s.playoffRound);
    const roundLooksLikeR1 = !Number.isFinite(pr) || pr === 1;
    return (
      s.seriesAbbrev === "R1" &&
      roundLooksLikeR1 &&
      ab(s.topSeedTeam?.abbrev) !== "" &&
      ab(s.bottomSeedTeam?.abbrev) !== "" &&
      ab(s.topSeedTeam?.abbrev) !== "TBD" &&
      ab(s.bottomSeedTeam?.abbrev) !== "TBD"
    );
  });
}

/** Overlay is on unless the env var is explicitly turned off (common misconfig: setting "false" thinking it enables sync). */
export function isNhlePublicBracketOverlayDisabled(): boolean {
  const v = process.env.NHL_PUBLIC_BRACKET_OVERLAY?.trim().toLowerCase() ?? "";
  return v === "false" || v === "0" || v === "off" || v === "no";
}

/**
 * Fetch league bracket JSON (short cache). Returns null if disabled or on transport/parse failure.
 */
export async function fetchNhleBracketJsonForOverlay(
  playoffYear: string = process.env.NHL_PLAYOFF_BRACKET_YEAR?.trim() || "2026",
): Promise<unknown | null> {
  if (isNhlePublicBracketOverlayDisabled()) {
    return null;
  }
  try {
    const res = await fetch(`${NHLE_PLAYOFF_BRACKET}/${encodeURIComponent(playoffYear)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "AshBracket/1.0 (+https://ashbracket.com)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Applies NHLE Round 1 wins / status / winner onto DB rows for **public display** only.
 * Does not persist; keeps DB `winner_team_id` when NHLE has not declared a winner yet.
 */
export function overlayRound1SeriesRowsFromBracket(
  rows: NhlSeriesRow[],
  bracketJson: unknown,
): NhlSeriesRow[] {
  const rawSeries = bracketJson as { series?: NhleSeriesItem[] };
  const apiList = rawSeries.series ?? [];
  const r1FromApi = filterR1Items(apiList);

  const patchBySeriesId = new Map<
    string,
    Pick<NhlSeriesRow, "games_won_by_higher_seed" | "games_won_by_lower_seed" | "status" | "winner_team_id">
  >();

  for (const slot of NHL_2026_ROUND1_SLOTS) {
    const hiAbbr = abbreviationForSlug(slot.higher_team_slug)?.toUpperCase() ?? "";
    const loAbbr = abbreviationForSlug(slot.lower_team_slug)?.toUpperCase() ?? "";
    if (!hiAbbr || !loAbbr) continue;

    let apiSlice: NhleSeriesItem | undefined;
    for (const api of r1FromApi) {
      const top = api.topSeedTeam!.abbrev!.toUpperCase();
      const bottom = api.bottomSeedTeam!.abbrev!.toUpperCase();
      const mapped = mapWinsToHigherLower(hiAbbr, loAbbr, top, bottom, Number(api.topSeedWins ?? 0), Number(api.bottomSeedWins ?? 0));
      if (mapped) {
        apiSlice = api;
        break;
      }
    }
    if (!apiSlice) continue;

    const row = rows.find(
      (r) =>
        r.round_code === "R1" &&
        r.side_or_conference === slot.side &&
        r.slot_index === slot.slot_index,
    );
    if (!row || !row.higher_seed_team_id || !row.lower_seed_team_id) continue;

    const topWins = Number(apiSlice.topSeedWins ?? 0);
    const bottomWins = Number(apiSlice.bottomSeedWins ?? 0);
    const mapped = mapWinsToHigherLower(
      hiAbbr,
      loAbbr,
      apiSlice.topSeedTeam!.abbrev!.toUpperCase(),
      apiSlice.bottomSeedTeam!.abbrev!.toUpperCase(),
      topWins,
      bottomWins,
    );
    if (!mapped) continue;

    const winAbbr = winningAbbrev(apiSlice)?.toUpperCase() ?? null;
    let winnerResolved: string | null = null;
    if (winAbbr === hiAbbr) winnerResolved = row.higher_seed_team_id;
    else if (winAbbr === loAbbr) winnerResolved = row.lower_seed_team_id;

    const hasApiWinner =
      Boolean(apiSlice.winningTeamId && apiSlice.winningTeamId > 0) && winnerResolved !== null;
    const status = inferStatus(mapped.hi, mapped.lo, hasApiWinner);

    const winner_team_id =
      hasApiWinner && winnerResolved !== null ? winnerResolved : row.winner_team_id;

    patchBySeriesId.set(row.id, {
      games_won_by_higher_seed: mapped.hi,
      games_won_by_lower_seed: mapped.lo,
      status,
      winner_team_id,
    });
  }

  /** If slot keys did not line up with DB, still match R1 rows by the two team abbreviations. */
  const patchedIds = new Set(patchBySeriesId.keys());
  for (const row of rows) {
    if (row.round_code !== "R1" || patchedIds.has(row.id)) continue;
    const ha = row.higher_team_abbr?.toUpperCase() ?? "";
    const la = row.lower_team_abbr?.toUpperCase() ?? "";
    if (!ha || !la || !row.higher_seed_team_id || !row.lower_seed_team_id) continue;

    let apiSlice: NhleSeriesItem | undefined;
    for (const api of r1FromApi) {
      const top = api.topSeedTeam!.abbrev!.toUpperCase();
      const bottom = api.bottomSeedTeam!.abbrev!.toUpperCase();
      const mapped = mapWinsToHigherLower(ha, la, top, bottom, Number(api.topSeedWins ?? 0), Number(api.bottomSeedWins ?? 0));
      if (mapped) {
        apiSlice = api;
        break;
      }
    }
    if (!apiSlice) continue;

    const topWins = Number(apiSlice.topSeedWins ?? 0);
    const bottomWins = Number(apiSlice.bottomSeedWins ?? 0);
    const mapped = mapWinsToHigherLower(
      ha,
      la,
      apiSlice.topSeedTeam!.abbrev!.toUpperCase(),
      apiSlice.bottomSeedTeam!.abbrev!.toUpperCase(),
      topWins,
      bottomWins,
    );
    if (!mapped) continue;

    const winAbbr = winningAbbrev(apiSlice)?.toUpperCase() ?? null;
    let winnerResolved: string | null = null;
    if (winAbbr === ha) winnerResolved = row.higher_seed_team_id;
    else if (winAbbr === la) winnerResolved = row.lower_seed_team_id;

    const hasApiWinner =
      Boolean(apiSlice.winningTeamId && apiSlice.winningTeamId > 0) && winnerResolved !== null;
    const status = inferStatus(mapped.hi, mapped.lo, hasApiWinner);
    const winner_team_id =
      hasApiWinner && winnerResolved !== null ? winnerResolved : row.winner_team_id;

    patchBySeriesId.set(row.id, {
      games_won_by_higher_seed: mapped.hi,
      games_won_by_lower_seed: mapped.lo,
      status,
      winner_team_id,
    });
    patchedIds.add(row.id);
  }

  return rows.map((row) => {
    const p = patchBySeriesId.get(row.id);
    if (!p) return row;
    return { ...row, ...p };
  });
}
