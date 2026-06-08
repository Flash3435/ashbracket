import type { SupabaseClient } from "@supabase/supabase-js";
import type { NhlStandingsRow } from "./types";
import { fetchNhlEditionStandings } from "./queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NhlPublicPickOutcome = "correct" | "incorrect" | "pending";

export type NhlPublicEntryPickRow = {
  seriesId: string;
  roundCode: "R1" | "R2" | "CF" | "SCF";
  roundOrder: number;
  sideOrConference: "east" | "west" | "cup" | null;
  slotIndex: number;
  higherTeamAbbr: string | null;
  higherTeamName: string | null;
  lowerTeamAbbr: string | null;
  lowerTeamName: string | null;
  pickedTeamAbbr: string | null;
  pickedTeamName: string | null;
  scoringWinnerAbbr: string | null;
  scoringWinnerName: string | null;
  outcome: NhlPublicPickOutcome;
};

export type NhlPublicRoundSummary = {
  roundCode: NhlPublicEntryPickRow["roundCode"];
  label: string;
  correctCount: number;
  decidedCount: number;
  points: number;
};

export type NhlPublicEntryDetail = {
  membershipId: string;
  entryName: string;
  editionName: string;
  seasonLabel: string;
  standings: NhlStandingsRow;
  picks: NhlPublicEntryPickRow[];
  roundSummaries: NhlPublicRoundSummary[];
};

export type FetchNhlPublicEntryDetailResult =
  | { ok: true; data: NhlPublicEntryDetail }
  | { ok: false; kind: "not_found" | "error"; message?: string };

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mapPickRow(raw: Record<string, unknown>): NhlPublicEntryPickRow | null {
  const seriesId = raw.series_id;
  const roundCode = raw.round_code;
  const outcome = raw.outcome;
  if (typeof seriesId !== "string" || typeof roundCode !== "string") {
    return null;
  }
  if (roundCode !== "R1" && roundCode !== "R2" && roundCode !== "CF" && roundCode !== "SCF") {
    return null;
  }
  if (outcome !== "correct" && outcome !== "incorrect" && outcome !== "pending") {
    return null;
  }
  const side = raw.side_or_conference;
  const sideOrConference =
    side === "east" || side === "west" || side === "cup"
      ? side
      : side === null || side === undefined
        ? null
        : null;
  const roundOrder = Number(raw.round_order);
  const slotIndex = Number(raw.slot_index);

  return {
    seriesId,
    roundCode,
    roundOrder: Number.isFinite(roundOrder) ? roundOrder : 0,
    sideOrConference,
    slotIndex: Number.isFinite(slotIndex) ? slotIndex : 0,
    higherTeamAbbr: strOrNull(raw.higher_team_abbr),
    higherTeamName: strOrNull(raw.higher_team_name),
    lowerTeamAbbr: strOrNull(raw.lower_team_abbr),
    lowerTeamName: strOrNull(raw.lower_team_name),
    pickedTeamAbbr: strOrNull(raw.picked_team_abbr),
    pickedTeamName: strOrNull(raw.picked_team_name),
    scoringWinnerAbbr: strOrNull(raw.scoring_winner_abbr),
    scoringWinnerName: strOrNull(raw.scoring_winner_name),
    outcome,
  };
}

const ROUND_LABELS: Record<NhlPublicEntryPickRow["roundCode"], string> = {
  R1: "Round 1",
  R2: "Round 2",
  CF: "Conference Final",
  SCF: "Stanley Cup Final",
};

function pointsForRound(
  standings: NhlStandingsRow,
  roundCode: NhlPublicEntryPickRow["roundCode"],
): number {
  switch (roundCode) {
    case "R1":
      return standings.round1_points;
    case "R2":
      return standings.round2_points;
    case "CF":
      return standings.conference_final_points;
    case "SCF":
      return standings.stanley_cup_final_points;
    default:
      return 0;
  }
}

export function buildNhlPublicRoundSummaries(
  picks: NhlPublicEntryPickRow[],
  standings: NhlStandingsRow,
): NhlPublicRoundSummary[] {
  const order: NhlPublicEntryPickRow["roundCode"][] = ["R1", "R2", "CF", "SCF"];
  const byRound = new Map<NhlPublicEntryPickRow["roundCode"], NhlPublicEntryPickRow[]>();
  for (const p of picks) {
    const list = byRound.get(p.roundCode) ?? [];
    list.push(p);
    byRound.set(p.roundCode, list);
  }

  const summaries: NhlPublicRoundSummary[] = [];
  for (const roundCode of order) {
    const roundPicks = byRound.get(roundCode);
    if (!roundPicks?.length) continue;
    const decided = roundPicks.filter((p) => p.outcome !== "pending");
    const correctCount = roundPicks.filter((p) => p.outcome === "correct").length;
    summaries.push({
      roundCode,
      label: ROUND_LABELS[roundCode],
      correctCount,
      decidedCount: decided.length,
      points: pointsForRound(standings, roundCode),
    });
  }
  return summaries;
}

export function formatNhlPublicEntrySlotLabel(pick: NhlPublicEntryPickRow): string {
  if (pick.sideOrConference === "east" || pick.sideOrConference === "west") {
    const letter = pick.sideOrConference === "east" ? "E" : "W";
    return `${letter} · ${pick.slotIndex}`;
  }
  if (pick.sideOrConference === "cup") {
    return "Stanley Cup";
  }
  return `Slot ${pick.slotIndex}`;
}

export function formatNhlPublicMatchup(pick: NhlPublicEntryPickRow): string {
  const hi = pick.higherTeamAbbr ?? pick.higherTeamName ?? "TBD";
  const lo = pick.lowerTeamAbbr ?? pick.lowerTeamName ?? "TBD";
  return `${hi} vs ${lo}`;
}

export function formatNhlPublicTeamLabel(abbr: string | null, name: string | null): string {
  if (abbr && name && abbr !== name) return `${abbr} (${name})`;
  return abbr ?? name ?? "—";
}

export async function fetchNhlPublicEntryDetail(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<FetchNhlPublicEntryDetailResult> {
  if (!isUuid(membershipId)) {
    return { ok: false, kind: "not_found" };
  }

  const { data: ctxRows, error: ctxError } = await supabase.rpc("fetch_nhl_public_entry_context", {
    p_membership_id: membershipId,
  });

  if (ctxError) {
    return { ok: false, kind: "error", message: ctxError.message };
  }

  const ctx = (ctxRows ?? [])[0] as Record<string, unknown> | undefined;
  if (
    !ctx ||
    typeof ctx.user_id !== "string" ||
    typeof ctx.edition_id !== "string" ||
    typeof ctx.entry_name !== "string"
  ) {
    return { ok: false, kind: "not_found" };
  }

  const editionId = ctx.edition_id;
  const userId = ctx.user_id;

  const [standingsRes, picksRes] = await Promise.all([
    fetchNhlEditionStandings(supabase, editionId),
    supabase.rpc("fetch_nhl_public_entry_picks", { p_membership_id: membershipId }),
  ]);

  if (standingsRes.error) {
    return { ok: false, kind: "error", message: standingsRes.error };
  }
  if (picksRes.error) {
    return { ok: false, kind: "error", message: picksRes.error.message };
  }

  const standingsRow = standingsRes.rows.find((r) => r.user_id === userId);
  if (!standingsRow) {
    return { ok: false, kind: "not_found" };
  }

  const picks: NhlPublicEntryPickRow[] = [];
  for (const raw of picksRes.data ?? []) {
    const mapped = mapPickRow(raw as Record<string, unknown>);
    if (mapped) picks.push(mapped);
  }

  const roundSummaries = buildNhlPublicRoundSummaries(picks, standingsRow);

  return {
    ok: true,
    data: {
      membershipId,
      entryName: ctx.entry_name as string,
      editionName: typeof ctx.edition_name === "string" ? ctx.edition_name : "NHL Playoffs",
      seasonLabel: typeof ctx.season_label === "string" ? ctx.season_label : "",
      standings: standingsRow,
      picks,
      roundSummaries,
    },
  };
}
