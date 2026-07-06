#!/usr/bin/env tsx
/**
 * Audit leaderboard latest-match impact vs ledger and score-impact metadata.
 *
 *   npx tsx scripts/audit-latest-match-impact.ts "FAMPOOL 2026" --match "Norway vs Brazil"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildLeaderboardMomentum } from "../lib/leaderboard/buildLeaderboardMomentum";
import { buildPoolStandingsFromLedger } from "../lib/leaderboard/buildPoolStandingsFromLedger";
import { buildLatestPointsBreakdownByParticipantId } from "../lib/leaderboard/computeLatestMatchPointsBreakdown";
import { enrichScoreImpactEventMetadata } from "../lib/leaderboard/enrichScoreImpactEventMetadata";
import { fetchPoolLedgerLinesForStandings } from "../lib/leaderboard/fetchPoolLedgerLinesForStandings";
import {
  formatLatestMatchScoringLine,
} from "../lib/leaderboard/leaderboardBracketImpactDisplay";
import { formatRecentPointsDelta } from "../lib/leaderboard/leaderboardMomentumDisplay";
import {
  parseLatestScoreEventContext,
} from "../lib/leaderboard/parseLatestScoreEventContext";
import {
  parsePreviousStandingsFromMetadata,
} from "../lib/leaderboard/validateLeaderboardMomentumSnapshot";
import { loadEnvLocal } from "./loadEnvLocal";

type PoolLookupRow = { id: string; name: string | null; tournament_edition_id: string | null };

type LedgerRow = {
  participant_id: string;
  points_delta: number | string | null;
  result_id: string | null;
  prediction_kind: string | null;
  note: string | null;
  created_at: string;
};

type TeamRow = { id: string; name: string | null; country_code: string | null };
type MatchRow = {
  id: string;
  match_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  winner_team_id: string | null;
  stage_code: string;
  scoring_result_kind: string | null;
  scoring_slot_key: string | null;
};

function parseArgs(argv: string[]): { poolIdentifier: string; matchQuery: string | null } {
  const positional: string[] = [];
  let matchQuery: string | null = null;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--match") {
      matchQuery = argv[i + 1]?.trim() ?? null;
      i += 1;
      continue;
    }
    positional.push(arg);
  }
  return {
    poolIdentifier: positional[0]?.trim() ?? "FAMPOOL 2026",
    matchQuery,
  };
}

async function resolvePoolId(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ poolId: string; poolName: string; editionId: string | null }> {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRe.test(identifier)) {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name, tournament_edition_id")
      .eq("id", identifier)
      .maybeSingle();
    const row = data as PoolLookupRow | null;
    if (error || !row?.id) throw new Error(error?.message ?? "Pool not found");
    return {
      poolId: row.id,
      poolName: String(row.name ?? identifier),
      editionId: row.tournament_edition_id,
    };
  }

  const { data, error } = await supabase
    .from("pools")
    .select("id, name, tournament_edition_id")
    .ilike("name", `%${identifier}%`);
  if (error) throw new Error(error.message);
  const matches = (data ?? []) as PoolLookupRow[];
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No pool matching "${identifier}"`
        : `Ambiguous pool name "${identifier}" (${matches.length} matches)`,
    );
  }
  const match = matches[0]!;
  return {
    poolId: match.id,
    poolName: String(match.name ?? identifier),
    editionId: match.tournament_edition_id,
  };
}

function normalizeMatchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+vs\.?\s+|\s+v\s+|\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function resolveMatchByQuery(
  supabase: SupabaseClient,
  editionId: string,
  matchQuery: string | null,
  teams: TeamRow[],
): Promise<MatchRow | null> {
  if (!matchQuery) return null;
  const parts = normalizeMatchQuery(matchQuery);
  if (parts.length < 2) return null;

  const teamIdsForPart = (part: string): Set<string> => {
    const ids = new Set<string>();
    for (const team of teams) {
      const name = (team.name ?? "").toLowerCase();
      const code = (team.country_code ?? "").toLowerCase();
      if (name.includes(part) || code === part) ids.add(team.id);
    }
    return ids;
  };

  const homeCandidates = teamIdsForPart(parts[0]!);
  const awayCandidates = teamIdsForPart(parts[1]!);

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, stage_code, scoring_result_kind, scoring_slot_key",
    )
    .eq("edition_id", editionId);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MatchRow[];
  return (
    rows.find((row) => {
      const direct =
        (row.home_team_id && homeCandidates.has(row.home_team_id) &&
          row.away_team_id && awayCandidates.has(row.away_team_id)) ||
        (row.home_team_id && awayCandidates.has(row.home_team_id) &&
          row.away_team_id && homeCandidates.has(row.away_team_id));
      return direct;
    }) ?? null
  );
}

async function fetchFullLedger(
  supabase: SupabaseClient,
  poolId: string,
): Promise<LedgerRow[]> {
  const pageSize = 1000;
  const rows: LedgerRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("points_ledger")
      .select("participant_id, points_delta, result_id, prediction_kind, note, created_at")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as LedgerRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function resolveResultIdsForMatch(
  supabase: SupabaseClient,
  editionId: string,
  match: MatchRow,
): Promise<string[]> {
  const ids = new Set<string>();
  const winnerId = match.winner_team_id;
  if (winnerId) {
    const { data: winnerResults } = await supabase
      .from("results")
      .select("id, kind, slot_key, resolved_at")
      .eq("edition_id", editionId)
      .eq("team_id", winnerId);
    for (const row of winnerResults ?? []) {
      ids.add(row.id as string);
    }
  }

  if (match.scoring_result_kind && match.scoring_slot_key && winnerId) {
    const { data: slotResult } = await supabase
      .from("results")
      .select("id")
      .eq("edition_id", editionId)
      .eq("kind", match.scoring_result_kind)
      .eq("slot_key", match.scoring_slot_key)
      .eq("team_id", winnerId)
      .maybeSingle();
    if (slotResult?.id) ids.add(slotResult.id as string);
  }

  return [...ids];
}

function teamName(teams: TeamRow[], teamId: string | null | undefined): string {
  if (!teamId) return "TBD";
  return teams.find((t) => t.id === teamId)?.name ?? teamId.slice(0, 8);
}

async function main() {
  const { poolIdentifier, matchQuery } = parseArgs(process.argv);
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { poolId, poolName, editionId } = await resolvePoolId(supabase, poolIdentifier);
  if (!editionId) throw new Error("Pool has no tournament_edition_id.");

  console.log(`\n=== Latest match impact audit: ${poolName} (${poolId}) ===\n`);

  const { data: activity, error: actErr } = await supabase
    .from("pool_activity")
    .select("id, created_at, body_text, metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (actErr) throw new Error(actErr.message);

  const rawMetadata =
    activity?.metadata_json && typeof activity.metadata_json === "object"
      ? (activity.metadata_json as Record<string, unknown>)
      : null;

  const enrichedMetadata = rawMetadata
    ? await enrichScoreImpactEventMetadata(supabase, poolId, rawMetadata, {
        eventCreatedAt: activity?.created_at as string | null,
      })
    : null;

  const metadata = enrichedMetadata ?? rawMetadata;
  const event = metadata
    ? parseLatestScoreEventContext(metadata, { hasValidSnapshot: true })
    : null;

  console.log("Latest score-impact activity:");
  console.log(`  id:              ${activity?.id ?? "—"}`);
  console.log(`  created_at:      ${activity?.created_at ?? "—"}`);
  console.log(`  trigger:         ${metadata?.trigger ?? "—"}`);
  console.log(`  title/body:      ${String(activity?.body_text ?? "—").slice(0, 120)}`);
  console.log(`  match_codes:     ${JSON.stringify(metadata?.match_codes ?? [])}`);
  console.log(`  match_label:     ${metadata?.match_label ?? "—"}`);
  console.log(`  scoreline:       ${metadata?.scoreline ?? "—"}`);
  console.log(
    `  previous_standings count: ${
      Array.isArray(metadata?.previous_standings) ? metadata.previous_standings.length : 0
    }`,
  );
  const bracketImpact =
    metadata?.bracket_impact != null && typeof metadata.bracket_impact === "object"
      ? (metadata.bracket_impact as Record<string, unknown>)
      : null;
  console.log(
    `  bracket_impact:  ${
      bracketImpact
        ? JSON.stringify({
            uniform_points_delta: bracketImpact.uniform_points_delta,
            winner_team_name: bracketImpact.winner_team_name,
            loser_team_name: bracketImpact.loser_team_name,
            participant_rows: Array.isArray(bracketImpact.participant_rows)
              ? bracketImpact.participant_rows.length
              : 0,
          })
        : "—"
    }`,
  );
  console.log(`  inferred match:  ${metadata?.match_attribution_inferred === true ? "yes" : "no"}`);
  console.log(`  event kind:      ${event?.eventKind ?? "—"}`);
  console.log(`  matchup label:   ${event?.matchupShortLabel ?? "—"}`);

  const { data: teamsRaw } = await supabase.from("teams").select("id, name, country_code");
  const teams = (teamsRaw ?? []) as TeamRow[];

  const match = await resolveMatchByQuery(supabase, editionId, matchQuery, teams);
  if (match) {
    console.log(`\nMatch query "${matchQuery}":`);
    console.log(
      `  code: ${match.match_code} · ${teamName(teams, match.home_team_id)} ${match.home_goals ?? "?"}–${match.away_goals ?? "?"} ${teamName(teams, match.away_team_id)} · winner=${teamName(teams, match.winner_team_id)}`,
    );
  } else if (matchQuery) {
    console.log(`\nMatch query "${matchQuery}": not found for edition ${editionId}`);
  }

  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);
  if (pErr) throw new Error(pErr.message);

  const ledgerRes = await fetchPoolLedgerLinesForStandings(supabase, poolId);
  if (!ledgerRes.ok) throw new Error(ledgerRes.error);
  const fullLedger = await fetchFullLedger(supabase, poolId);

  const standings = buildPoolStandingsFromLedger({
    poolId,
    poolName,
    participants: (participants ?? []).map((p) => ({
      id: p.id as string,
      display_name: p.display_name as string | null,
    })),
    ledgerLines: ledgerRes.ledgerLines,
  });

  const previousRows = metadata ? parsePreviousStandingsFromMetadata(metadata) : null;
  const momentum = buildLeaderboardMomentum({
    currentRows: standings.map((r) => ({
      participantId: r.participantId,
      totalPoints: r.totalPoints,
      rank: r.rank,
    })),
    previousRows,
  });

  const storedMomentum = Array.isArray(metadata?.leaderboard_momentum)
    ? (metadata.leaderboard_momentum as Record<string, unknown>[])
    : [];

  const matchResultIds =
    match != null ? await resolveResultIdsForMatch(supabase, editionId, match) : [];

  const winnerId = match?.winner_team_id ?? null;
  const loserId =
    match?.home_team_id === winnerId ? match.away_team_id : match?.home_team_id ?? null;

  const { data: preds } = await supabase
    .from("predictions")
    .select("participant_id, prediction_kind, team_id, slot_key")
    .eq("pool_id", poolId);

  const { data: rulesRaw } = await supabase
    .from("scoring_rules")
    .select("prediction_kind, points")
    .eq("pool_id", poolId);
  const rulesByKind = new Map(
    (rulesRaw ?? []).map((r) => [r.prediction_kind as string, Number(r.points)]),
  );

  const eventMatchCodes = event?.matchCodes ?? [];
  const { data: eventMatchesRaw } =
    eventMatchCodes.length > 0
      ? await supabase
          .from("tournament_matches")
          .select(
            "match_code, stage_code, group_code, home_team_id, away_team_id, winner_team_id, scoring_result_kind, scoring_slot_key",
          )
          .eq("edition_id", editionId)
          .in("match_code", eventMatchCodes)
      : { data: [] };
  const eventMatches = (eventMatchesRaw ?? []).map((row) => ({
    matchCode: row.match_code as string,
    stageCode: (row.stage_code as string | null) ?? null,
    groupCode: (row.group_code as string | null) ?? null,
    homeTeamId: (row.home_team_id as string | null) ?? null,
    awayTeamId: (row.away_team_id as string | null) ?? null,
    winnerTeamId: (row.winner_team_id as string | null) ?? null,
    scoringResultKind: (row.scoring_result_kind as string | null) ?? null,
    scoringSlotKey: (row.scoring_slot_key as string | null) ?? null,
  }));

  const momentumByParticipantId = new Map(
    momentum.rows.map((row) => [row.participantId, row]),
  );
  const pointsBreakdownByParticipantId = event
    ? buildLatestPointsBreakdownByParticipantId({
        participantIds: standings.map((r) => r.participantId),
        momentumByParticipantId,
        event,
        predictions: (preds ?? []).map((p) => ({
          participantId: p.participant_id as string,
          predictionKind: p.prediction_kind as string,
          teamId: (p.team_id as string | null) ?? null,
          slotKey: (p.slot_key as string | null) ?? null,
        })),
        matches: eventMatches,
        rulesByKind,
      })
    : new Map();

  const slotPickKind = match?.scoring_result_kind ?? null;
  const slotPickKey = match?.scoring_slot_key ?? null;

  const warnings: string[] = [];
  if (
    rawMetadata &&
    Array.isArray(rawMetadata.match_codes) &&
    rawMetadata.match_codes.length === 0
  ) {
    warnings.push(
      "Latest score-impact row has empty match_codes — leaderboard cannot attribute deltas to a specific match without inference.",
    );
  }
  if (event?.eventKind === "scoring_refresh" && !event.matchupShortLabel) {
    warnings.push(
      "Event classified as scoring_refresh — UI should not imply a specific match result.",
    );
  }

  console.log("\n--- Per participant ---");
  const headers = [
    "display_name",
    "slot_pick",
    "picked_winner",
    "picked_loser",
    "expected_match_pts",
    "match_pts_delta",
    "total_delta",
    "other_delta",
    "latest_line",
    "pts_column_suffix",
    "mismatch",
  ];
  console.log(headers.join("\t"));

  let uniformDelta: number | null = null;
  const deltaSpread = new Set<number>();
  const matchDeltaSpread = new Set<number>();

  for (const row of standings.sort((a, b) => a.rank - b.rank)) {
    const mom = momentum.rows.find((m) => m.participantId === row.participantId);
    const breakdown = pointsBreakdownByParticipantId.get(row.participantId) ?? null;
    const participantPreds = (preds ?? []).filter((p) => p.participant_id === row.participantId);

    const slotPick =
      slotPickKind && slotPickKey
        ? participantPreds.find(
            (p) =>
              p.prediction_kind === slotPickKind && p.slot_key === slotPickKey,
          )
        : null;
    const slotPickTeamId = slotPick?.team_id ?? null;
    const slotPickName = slotPickTeamId ? teamName(teams, slotPickTeamId) : "—";

    const knockoutPreds = participantPreds.filter((p) =>
      ["round_of_16", "round_of_32", "quarterfinalist"].includes(String(p.prediction_kind)),
    );
    const pickedWinner = Boolean(
      winnerId && knockoutPreds.some((p) => p.team_id === winnerId),
    );
    const pickedLoser = Boolean(
      loserId && knockoutPreds.some((p) => p.team_id === loserId),
    );

    const expectedMatchPts =
      slotPickTeamId && winnerId
        ? slotPickTeamId === winnerId
          ? rulesByKind.get("round_of_16") ?? 0
          : 0
        : null;

    const matchPtsDelta = breakdown?.latestMatchPointsDelta ?? null;
    const computedDelta = mom?.recentPointsGained ?? null;
    const otherDelta = breakdown?.otherScoringDelta ?? null;

    if (computedDelta != null) deltaSpread.add(computedDelta);
    if (matchPtsDelta != null) matchDeltaSpread.add(matchPtsDelta);
    if (uniformDelta == null && computedDelta != null) uniformDelta = computedDelta;
    else if (computedDelta != null && uniformDelta !== computedDelta) uniformDelta = NaN;

    const latestLine = formatLatestMatchScoringLine(mom ?? null, event, null, breakdown);
    const suffix = formatRecentPointsDelta(mom ?? null, {
      showZero: true,
      latestSuffix: event?.isSingleMatch === true,
      pointsBreakdown: breakdown,
      event: event ?? undefined,
    });

    const legacyLine = formatLatestMatchScoringLine(mom ?? null, event);
    const mismatchParts: string[] = [];
    if (
      expectedMatchPts != null &&
      matchPtsDelta != null &&
      expectedMatchPts !== matchPtsDelta
    ) {
      mismatchParts.push("expected-vs-match");
    }
    if (
      event?.isSingleMatch &&
      legacyLine &&
      latestLine &&
      legacyLine !== latestLine &&
      computedDelta != null &&
      matchPtsDelta != null &&
      computedDelta !== matchPtsDelta
    ) {
      mismatchParts.push("legacy-total-as-match");
    }
    const mismatch = mismatchParts.join(",") || "—";
    if (mismatch !== "—") {
      warnings.push(`${row.displayName}: ${mismatch}`);
    }

    console.log(
      [
        row.displayName,
        slotPickName,
        pickedWinner ? "yes" : "no",
        pickedLoser ? "yes" : "no",
        expectedMatchPts ?? "—",
        matchPtsDelta ?? "—",
        computedDelta,
        otherDelta ?? "—",
        latestLine ?? "—",
        suffix ?? "—",
        mismatch,
      ].join("\t"),
    );
  }

  console.log("\n--- Summary ---");
  console.log(`Participants: ${standings.length}`);
  console.log(`Unique total deltas: ${[...deltaSpread].join(", ")}`);
  console.log(`Unique match-specific deltas: ${[...matchDeltaSpread].join(", ")}`);
  if (
    event?.isSingleMatch &&
    deltaSpread.size === 1 &&
    matchDeltaSpread.size > 1
  ) {
    warnings.push(
      "Uniform total delta but mixed match-specific deltas — UI must not label total as match points.",
    );
  }
  if (
    event?.isSingleMatch &&
    deltaSpread.size === 1 &&
    [...deltaSpread][0] === 4 &&
    standings.length > 1 &&
    matchDeltaSpread.size <= 1
  ) {
    warnings.push(
      "All participants share the same +4 match delta — verify this is expected for the attributed match.",
    );
  }
  if (Number.isNaN(uniformDelta)) {
    console.log("Uniform +N for all: no (mixed deltas — expected for upset unless all picked winner)");
  } else {
    console.log(`Uniform delta across all: ${uniformDelta}`);
  }
  if (match) {
    console.log(`Match result ids linked: ${matchResultIds.length}`);
  }

  if (warnings.length > 0) {
    console.log("\n--- Mismatch warnings ---");
    for (const warning of warnings) console.log(`  • ${warning}`);
  } else {
    console.log("\nNo mismatch warnings.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
