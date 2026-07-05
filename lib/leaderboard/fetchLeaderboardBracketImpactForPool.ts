import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import { loadPoolExposureContext } from "../pool/loadPoolExposureContext";
import {
  buildBracketImpactForPool,
  parseBracketImpactParticipantRows,
  type BracketImpactParticipantRow,
} from "../poolActivity/scoreImpact/buildBracketImpact";
import type {
  BracketImpactActivityMetadata,
  BracketImpactSummaryMetadata,
  ScoreImpactMatchResult,
} from "../poolActivity/scoreImpact/types";
import { loadParticipantTeamPicksById } from "../poolActivity/scoreImpact/loadScoreImpactContext";
import { loadParticipantNamesById } from "../poolActivity/scoreImpact/loadScoreImpactContext";

export type LeaderboardBracketImpactResult = {
  hasBracketImpact: boolean;
  uniformPointsDelta: number | null;
  summary: BracketImpactSummaryMetadata | null;
  rowsByParticipantId: Map<string, BracketImpactParticipantRow>;
};

function readBracketImpactSummary(
  metadata: Record<string, unknown>,
): {
  summary: BracketImpactSummaryMetadata | null;
  uniformPointsDelta: number | null;
} {
  const raw = metadata.bracket_impact;
  if (raw == null || typeof raw !== "object") {
    return { summary: null, uniformPointsDelta: null };
  }

  const bracketImpact = raw as BracketImpactActivityMetadata;
  const uniformPointsDelta =
    typeof bracketImpact.uniform_points_delta === "number" &&
    Number.isFinite(bracketImpact.uniform_points_delta)
      ? bracketImpact.uniform_points_delta
      : null;

  return {
    summary: bracketImpact.summary ?? null,
    uniformPointsDelta,
  };
}

async function computeBracketImpactFallback(
  supabase: SupabaseClient,
  poolId: string,
  metadata: Record<string, unknown>,
  displayNameByParticipantId: ReadonlyMap<string, string>,
): Promise<LeaderboardBracketImpactResult | null> {
  const matchCodes = Array.isArray(metadata.match_codes)
    ? metadata.match_codes.filter((code): code is string => typeof code === "string")
    : [];
  if (matchCodes.length === 0) return null;

  const exposure = await loadPoolExposureContext(poolId);
  if (!exposure.ok) return null;

  const [participantNames, participantPicks] = await Promise.all([
    loadParticipantNamesById(supabase, poolId),
    loadParticipantTeamPicksById(supabase, poolId),
  ]);

  const previousStandings = Array.isArray(metadata.previous_standings)
    ? metadata.previous_standings
    : [];
  const beforeRows = previousStandings
    .map((row) => {
      if (row == null || typeof row !== "object") return null;
      const participantId = (row as { participant_id?: unknown }).participant_id;
      const totalPoints = (row as { total_points?: unknown }).total_points;
      if (typeof participantId !== "string" || typeof totalPoints !== "number") {
        return null;
      }
      return {
        participantId,
        displayName: participantNames.get(participantId) ?? "Participant",
        totalPoints,
        rank: 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const afterRows = beforeRows.map((row) => {
    const momentumRow = Array.isArray(metadata.leaderboard_momentum)
      ? metadata.leaderboard_momentum.find(
          (entry) =>
            entry != null &&
            typeof entry === "object" &&
            (entry as { participant_id?: unknown }).participant_id === row.participantId,
        )
      : null;
    const pointsGained =
      momentumRow != null && typeof momentumRow === "object"
        ? Number((momentumRow as { points_gained?: unknown }).points_gained) || 0
        : 0;
    return {
      ...row,
      totalPoints: row.totalPoints + pointsGained,
    };
  });

  const matchResults: ScoreImpactMatchResult[] = matchCodes.map((matchCode) => ({
    matchCode,
    label: typeof metadata.match_label === "string" ? metadata.match_label : matchCode,
    groupCode:
      typeof metadata.group_code === "string" ? metadata.group_code : null,
    winnerTeamId: null,
    stageCode:
      typeof metadata.stage_label === "string" ? metadata.stage_label : null,
  }));

  const primaryMatch = exposure.context.matches.find(
    (match) => match.match_code === matchCodes[0],
  );
  if (primaryMatch?.winner_country_code) {
    const winnerTeam = exposure.context.teams.find(
      (team) =>
        (team.countryCode ?? "").trim().toUpperCase() ===
        primaryMatch.winner_country_code!.trim().toUpperCase(),
    );
    if (winnerTeam && matchResults[0]) {
      matchResults[0] = {
        ...matchResults[0],
        winnerTeamId: winnerTeam.id,
        homeTeamId: exposure.context.teams.find(
          (team) =>
            (team.countryCode ?? "").trim().toUpperCase() ===
            (primaryMatch.home_country_code ?? "").trim().toUpperCase(),
        )?.id,
        awayTeamId: exposure.context.teams.find(
          (team) =>
            (team.countryCode ?? "").trim().toUpperCase() ===
            (primaryMatch.away_country_code ?? "").trim().toUpperCase(),
        )?.id,
      };
    }
  }

  const computed = buildBracketImpactForPool({
    participantBrackets: exposure.context.allParticipantBrackets,
    participantNames,
    participantPicks,
    championPicks: exposure.context.championPicks,
    teams: exposure.context.teams,
    tournamentMatches: exposure.context.matches,
    knockoutBracketPicksUnlocked: exposure.context.knockoutBracketPicksUnlocked,
    matchResults,
    beforeRows,
    afterRows,
  });

  if (!computed) return null;

  const rowsByParticipantId = new Map(
    computed.rows.map((row) => [
      row.participantId,
      {
        ...row,
        displayName:
          displayNameByParticipantId.get(row.participantId) ?? row.displayName,
      },
    ]),
  );

  return {
    hasBracketImpact: true,
    uniformPointsDelta: computed.uniformPointsDelta,
    summary: computed.summary,
    rowsByParticipantId,
  };
}

/**
 * Loads future-path bracket impact from the latest score-impact activity.
 * Falls back to on-the-fly computation for older rows without stored bracket_impact.
 */
export async function fetchLeaderboardBracketImpactForPool(
  supabase: SupabaseClient,
  poolId: string,
  currentRows: ReadonlyArray<LeaderboardPublicRow>,
): Promise<LeaderboardBracketImpactResult | null> {
  const { data, error } = await supabase
    .from("pool_activity")
    .select("metadata_json")
    .eq("pool_id", poolId)
    .eq("type", "ash_score_impact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.metadata_json || typeof data.metadata_json !== "object") {
    return null;
  }

  const metadata = data.metadata_json as Record<string, unknown>;
  const displayNameByParticipantId = new Map(
    currentRows.map((row) => [row.participantId, row.displayName]),
  );

  const parsedRows = parseBracketImpactParticipantRows(metadata);
  if (parsedRows.size > 0) {
    const { summary, uniformPointsDelta } = readBracketImpactSummary(metadata);
    for (const [participantId, row] of parsedRows) {
      row.displayName =
        displayNameByParticipantId.get(participantId) ?? row.displayName;
    }
    return {
      hasBracketImpact: true,
      uniformPointsDelta,
      summary,
      rowsByParticipantId: parsedRows,
    };
  }

  return computeBracketImpactFallback(
    supabase,
    poolId,
    metadata,
    displayNameByParticipantId,
  );
}
