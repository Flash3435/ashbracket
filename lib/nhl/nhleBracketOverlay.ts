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
    const abbrev = String(s.seriesAbbrev ?? "").trim().toUpperCase();
    const pr = s.playoffRound == null ? NaN : Number(s.playoffRound);
    const roundLooksLikeR1 = !Number.isFinite(pr) || pr === 1;
    return (
      abbrev === "R1" &&
      roundLooksLikeR1 &&
      ab(s.topSeedTeam?.abbrev) !== "" &&
      ab(s.bottomSeedTeam?.abbrev) !== "" &&
      ab(s.topSeedTeam?.abbrev) !== "TBD" &&
      ab(s.bottomSeedTeam?.abbrev) !== "TBD"
    );
  });
}

/** Opt-out only: set `NHL_DISABLE_LIVE_BRACKET_OVERLAY=true` to skip NHLE (we no longer read `NHL_PUBLIC_BRACKET_OVERLAY=false` — too easy to misconfigure in Vercel). */
export function isNhleLiveBracketOverlayDisabled(): boolean {
  const v = process.env.NHL_DISABLE_LIVE_BRACKET_OVERLAY?.trim().toLowerCase() ?? "";
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/** @deprecated use isNhleLiveBracketOverlayDisabled */
export function isNhlePublicBracketOverlayDisabled(): boolean {
  return isNhleLiveBracketOverlayDisabled();
}

/** NHLE path segment, e.g. `2026` for `…/playoff-bracket/2026` (not `20252026`). */
export function bracketYearFromEnv(): string {
  const raw = process.env.NHL_PLAYOFF_BRACKET_YEAR?.trim() ?? "";
  return /^\d{4}$/.test(raw) ? raw : "2026";
}

function nhleWinCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const x = parseInt(v, 10);
    return Number.isFinite(x) ? Math.max(0, x) : 0;
  }
  return 0;
}

/**
 * Fetch league bracket JSON (short cache). Returns null if disabled or on transport/parse failure.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchNhleBracketJsonForOverlay(
  playoffYear: string = bracketYearFromEnv(),
): Promise<unknown | null> {
  if (isNhleLiveBracketOverlayDisabled()) {
    console.warn("[nhle overlay] skipped: NHL_DISABLE_LIVE_BRACKET_OVERLAY is set");
    return null;
  }
  const url = `${NHLE_PLAYOFF_BRACKET}/${encodeURIComponent(playoffYear)}`;
  const attempts = 3;
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; AshBracket/1.0; +https://ashbracket.com)",
        },
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        console.warn(`[nhle overlay] ${lastErr} for ${url} (attempt ${i + 1}/${attempts})`);
      } else {
        return await res.json();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      console.warn(`[nhle overlay] fetch failed ${url} (attempt ${i + 1}/${attempts}): ${msg}`);
    }
    if (i < attempts - 1) {
      await sleep(200 * (i + 1));
    }
  }
  console.warn(`[nhle overlay] giving up on ${url}: ${lastErr}`);
  return null;
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
      const mapped = mapWinsToHigherLower(
        hiAbbr,
        loAbbr,
        top,
        bottom,
        nhleWinCount(api.topSeedWins),
        nhleWinCount(api.bottomSeedWins),
      );
      if (mapped) {
        apiSlice = api;
        break;
      }
    }
    if (!apiSlice) continue;

    const row = rows.find((r) => {
      const rc = String(r.round_code ?? "").toUpperCase();
      const side = String(r.side_or_conference ?? "").toLowerCase();
      return (
        rc === "R1" &&
        side === slot.side &&
        Number(r.slot_index) === Number(slot.slot_index)
      );
    });
    if (!row || !row.higher_seed_team_id || !row.lower_seed_team_id) continue;

    const topWins = nhleWinCount(apiSlice.topSeedWins);
    const bottomWins = nhleWinCount(apiSlice.bottomSeedWins);
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
    if (String(row.round_code ?? "").toUpperCase() !== "R1" || patchedIds.has(row.id)) continue;
    const ha = row.higher_team_abbr?.toUpperCase() ?? "";
    const la = row.lower_team_abbr?.toUpperCase() ?? "";
    if (!ha || !la || !row.higher_seed_team_id || !row.lower_seed_team_id) continue;

    let apiSlice: NhleSeriesItem | undefined;
    for (const api of r1FromApi) {
      const top = api.topSeedTeam!.abbrev!.toUpperCase();
      const bottom = api.bottomSeedTeam!.abbrev!.toUpperCase();
      const mapped = mapWinsToHigherLower(
        ha,
        la,
        top,
        bottom,
        nhleWinCount(api.topSeedWins),
        nhleWinCount(api.bottomSeedWins),
      );
      if (mapped) {
        apiSlice = api;
        break;
      }
    }
    if (!apiSlice) continue;

    const topWins = nhleWinCount(apiSlice.topSeedWins);
    const bottomWins = nhleWinCount(apiSlice.bottomSeedWins);
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
