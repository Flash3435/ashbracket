import { revalidateNhlPublicSurfaces } from "@/lib/nhl/revalidateNhlPublicSurfaces";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { bracketYearFromEnv } from "./nhleBracketOverlay";
import { NHL_2026_PLAYOFF_TEAMS, NHL_2026_ROUND1_SLOTS } from "./nhl2026PlayoffField";
import { fetchActiveNhlEdition } from "./queries";
import type { NhlSeries } from "./types";

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

export type SyncNhlSeriesFromNhleResult =
  | {
      ok: true;
      playoffYear: string;
      round1Updated: number;
      round1Skipped: number;
      /** DB already had a different winner than NHLE — left unchanged (admin override). */
      round1ConflictSkipped: number;
      errors: string[];
    }
  | { ok: false; error: string };

/**
 * Idempotent: pulls official Round 1 finals from NHLE into `nhl_series` when the service role key
 * is configured. Runs on `/nhl/picks` and `/nhl/standings` so leaderboard scoring matches public picks.
 * Fails quietly (logs) if the key or network is unavailable.
 */
export async function maybeSyncNhlBracketRound1ToDatabase(): Promise<void> {
  const result = await syncNhlSeriesFromNhleBracket();
  if (!result.ok) {
    console.warn("[nhle sync] Round 1 bracket sync skipped:", result.error);
    return;
  }
  if (result.errors.length > 0 || result.round1ConflictSkipped > 0) {
    console.warn(
      "[nhle sync] Round 1 completed:",
      [...result.errors, `conflicts_skipped=${result.round1ConflictSkipped}`].join("; "),
    );
  }
  if (result.round1Updated > 0) {
    revalidateNhlPublicSurfaces();
  }
}

/**
 * Pulls live Round 1 wins (and series winner when the league marks the series decided) from the
 * public NHLE bracket API into `nhl_series` for the **active** NHL edition.
 *
 * Pairings must match {@link NHL_2026_ROUND1_SLOTS} abbreviations versus the NHLE bracket.
 */
export async function syncNhlSeriesFromNhleBracket(
  playoffYear: string = bracketYearFromEnv(),
): Promise<SyncNhlSeriesFromNhleResult> {
  const errors: string[] = [];

  let res: Response;
  try {
    res = await fetch(`${NHLE_PLAYOFF_BRACKET}/${encodeURIComponent(playoffYear)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "AshBracket/1.0 (+https://ashbracket.com)",
      },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `NHLE bracket fetch failed: ${msg}` };
  }

  if (!res.ok) {
    return { ok: false, error: `NHLE bracket HTTP ${res.status}` };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "NHLE bracket response is not JSON" };
  }

  const rawSeries = payload as { series?: NhleSeriesItem[] };
  const apiList = rawSeries.series ?? [];
  const r1FromApi = apiList.filter((s) => {
    const ab = (x: string | undefined) => (x ?? "").trim().toUpperCase();
    return (
      s.seriesAbbrev === "R1" &&
      Number(s.playoffRound) === 1 &&
      ab(s.topSeedTeam?.abbrev) !== "" &&
      ab(s.bottomSeedTeam?.abbrev) !== "" &&
      ab(s.topSeedTeam?.abbrev) !== "TBD" &&
      ab(s.bottomSeedTeam?.abbrev) !== "TBD"
    );
  });

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    return { ok: false, error: edErr || "No active NHL edition" };
  }

  const { data: teams, error: tErr } = await supabase
    .from("nhl_teams")
    .select("id, abbreviation")
    .eq("edition_id", edition.id);

  if (tErr || !teams?.length) {
    return { ok: false, error: tErr?.message || "No teams for active edition" };
  }

  const idByAbbrev = new Map<string, string>();
  for (const t of teams as { id: string; abbreviation: string }[]) {
    idByAbbrev.set(t.abbreviation.toUpperCase(), t.id);
  }

  let round1Updated = 0;
  let round1Skipped = 0;
  let round1ConflictSkipped = 0;

  for (const slot of NHL_2026_ROUND1_SLOTS) {
    const hiAbbr = abbreviationForSlug(slot.higher_team_slug)?.toUpperCase() ?? "";
    const loAbbr = abbreviationForSlug(slot.lower_team_slug)?.toUpperCase() ?? "";
    if (!hiAbbr || !loAbbr) {
      errors.push(`Missing abbreviation for slug pair ${slot.higher_team_slug} / ${slot.lower_team_slug}`);
      round1Skipped += 1;
      continue;
    }

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

    if (!apiSlice) {
      round1Skipped += 1;
      errors.push(`R1 ${slot.side} slot ${slot.slot_index}: no NHLE match for pair ${hiAbbr}–${loAbbr}`);
      continue;
    }

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
    const hiId = idByAbbrev.get(hiAbbr) ?? null;
    const loId = idByAbbrev.get(loAbbr) ?? null;
    let winnerIdResolved: string | null = null;
    if (winAbbr && hiId && loId) {
      if (winAbbr === hiAbbr) winnerIdResolved = hiId;
      else if (winAbbr === loAbbr) winnerIdResolved = loId;
    }

    const hasApiWinner =
      Boolean(apiSlice.winningTeamId && apiSlice.winningTeamId > 0) && winnerIdResolved !== null;
    const status = inferStatus(mapped.hi, mapped.lo, hasApiWinner);

    const { data: existingRow, error: exErr } = await supabase
      .from("nhl_series")
      .select("winner_team_id")
      .eq("edition_id", edition.id)
      .eq("round_code", "R1")
      .eq("side_or_conference", slot.side)
      .eq("slot_index", slot.slot_index)
      .maybeSingle();

    if (exErr) {
      errors.push(`R1 ${slot.side} #${slot.slot_index}: ${exErr.message}`);
      round1Skipped += 1;
      continue;
    }

    const dbWinnerId = (existingRow as { winner_team_id: string | null } | null)?.winner_team_id ?? null;

    if (hasApiWinner && winnerIdResolved && dbWinnerId && dbWinnerId !== winnerIdResolved) {
      round1ConflictSkipped += 1;
      errors.push(
        `R1 ${slot.side} #${slot.slot_index}: skipped — pool already has a different winner than NHLE (admin override).`,
      );
      continue;
    }

    const updatePayload: {
      games_won_by_higher_seed: number;
      games_won_by_lower_seed: number;
      status: NhlSeries["status"];
      winner_team_id?: string;
    } = {
      games_won_by_higher_seed: mapped.hi,
      games_won_by_lower_seed: mapped.lo,
      status,
    };

    if (hasApiWinner && winnerIdResolved) {
      updatePayload.winner_team_id = winnerIdResolved;
    }

    const { error: upErr } = await supabase
      .from("nhl_series")
      .update(updatePayload)
      .eq("edition_id", edition.id)
      .eq("round_code", "R1")
      .eq("side_or_conference", slot.side)
      .eq("slot_index", slot.slot_index);

    if (upErr) {
      errors.push(`R1 ${slot.side} #${slot.slot_index}: ${upErr.message}`);
      round1Skipped += 1;
    } else {
      round1Updated += 1;
    }
  }

  return { ok: true, playoffYear, round1Updated, round1Skipped, round1ConflictSkipped, errors };
}
