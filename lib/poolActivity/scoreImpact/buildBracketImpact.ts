import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import { eliminatedTeamIdsFromMatches } from "@/lib/participant/bracketMatchImpact";
import {
  buildPathValidRaceOutlookForParticipant,
  type PathValidRaceOutlook,
} from "@/lib/pool/buildPathValidRaceOutlookForParticipant";
import {
  resolveChampionPickForParticipant,
  type ResolvedChampionPick,
} from "@/lib/pool/buildParticipantRaceOutlook";
import type { ParticipantBracketForExposure } from "@/lib/pool/buildKnockoutMatchExposure";
import type { ParticipantTeamPicks } from "./buildSoftImpact";
import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import type { Team } from "../../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../../types/tournamentPublic";
import type {
  BracketImpactActivityMetadata,
  BracketImpactParticipantMetadata,
  BracketImpactSummaryMetadata,
  BracketImpactUpsetLabel,
  ScoreImpactMatchResult,
  ScoreImpactPointGainer,
} from "./types";

export type BracketPathSnapshot = {
  livePathCount: number;
  championAlive: boolean;
  finalistPathAlive: boolean;
  semifinalistPathAlive: boolean;
};

export type BracketImpactParticipantRow = {
  participantId: string;
  displayName: string;
  livePathsBefore: number;
  livePathsAfter: number;
  livePathsDelta: number;
  championAliveBefore: boolean;
  championAliveAfter: boolean;
  finalistPathAliveBefore: boolean;
  finalistPathAliveAfter: boolean;
  semifinalistPathAliveBefore: boolean;
  semifinalistPathAliveAfter: boolean;
  pickedUpsetWinner: boolean;
  pickedEliminatedTeam: boolean;
  upsetImpact: BracketImpactUpsetLabel;
};

export type BracketImpactResult = {
  rows: BracketImpactParticipantRow[];
  summary: BracketImpactSummaryMetadata;
  uniformPointsDelta: number | null;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  hasMeaningfulBracketChange: boolean;
};

const BIGGEST_IMPACT_LIMIT = 3;

/** Revert finished match results so bracket paths reflect the pre-result state. */
export function revertMatchesToBeforeResult(
  matches: readonly TournamentMatchPublicRow[],
  matchCodes: readonly string[],
): TournamentMatchPublicRow[] {
  const codeSet = new Set(matchCodes.map((code) => code.trim()).filter(Boolean));
  if (codeSet.size === 0) return [...matches];

  return matches.map((match) => {
    if (!codeSet.has(match.match_code)) return match;
    return {
      ...match,
      status: "scheduled",
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      winner_team_name: null,
      winner_country_code: null,
    };
  });
}

function snapshotFromOutlook(input: {
  outlook: PathValidRaceOutlook;
  champion: ResolvedChampionPick;
  eliminatedTeamIds: ReadonlySet<string>;
}): BracketPathSnapshot {
  const hasChampionPick = input.champion.hasChampionPick;
  const championPathDead =
    hasChampionPick &&
    (input.outlook.championPathDead ||
      input.eliminatedTeamIds.has(input.champion.teamId));

  return {
    livePathCount: input.outlook.pathValidLivePickCount,
    championAlive: hasChampionPick && !championPathDead,
    finalistPathAlive: input.outlook.hasLiveFinalistPick,
    semifinalistPathAlive: input.outlook.hasLiveSemifinalistPick,
  };
}

export function buildBracketPathSnapshotForParticipant(input: {
  participantId: string;
  bracket: ParticipantBracketForExposure;
  championPicks: ChampionPickInput[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  knockoutBracketPicksUnlocked: boolean;
  eliminatedTeamIds: ReadonlySet<string>;
}): BracketPathSnapshot {
  const champion = resolveChampionPickForParticipant({
    participantId: input.participantId,
    championPicks: input.championPicks,
    bracketSlots: input.bracket.slots,
    teams: input.teams,
  });

  const outlook = buildPathValidRaceOutlookForParticipant({
    slots: input.bracket.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
    championTeamId: champion.hasChampionPick ? champion.teamId : null,
  });

  return snapshotFromOutlook({
    outlook,
    champion,
    eliminatedTeamIds: input.eliminatedTeamIds,
  });
}

function resolveMatchLoserTeamId(
  match: ScoreImpactMatchResult | null,
  teams: Team[],
): string | null {
  if (!match?.winnerTeamId?.trim()) return null;
  const winnerId = match.winnerTeamId.trim();
  const homeId = match.homeTeamId?.trim() || null;
  const awayId = match.awayTeamId?.trim() || null;
  if (homeId && homeId !== winnerId) return homeId;
  if (awayId && awayId !== winnerId) return awayId;

  const teamByCountry = new Map(
    teams
      .map((team) => [(team.countryCode ?? "").trim().toUpperCase(), team.id] as const)
      .filter(([code]) => code.length > 0),
  );
  const winner = teams.find((team) => team.id === winnerId);
  const winnerCode = (winner?.countryCode ?? "").trim().toUpperCase();
  if (!winnerCode) return null;
  if (homeId && homeId !== winnerId) return homeId;
  if (awayId && awayId !== winnerId) return awayId;
  return null;
}

function resolveLoserFromPublicMatch(
  match: TournamentMatchPublicRow | undefined,
  winnerTeamId: string,
  teams: Team[],
): string | null {
  if (!match) return null;
  const teamByCountry = new Map(
    teams
      .map((team) => [(team.countryCode ?? "").trim().toUpperCase(), team.id] as const)
      .filter(([code]) => code.length > 0),
  );
  const winnerCode = (match.winner_country_code ?? "").trim().toUpperCase();
  const homeCode = (match.home_country_code ?? "").trim().toUpperCase();
  const awayCode = (match.away_country_code ?? "").trim().toUpperCase();
  const loserCode =
    winnerCode && homeCode && homeCode !== winnerCode
      ? homeCode
      : winnerCode && awayCode && awayCode !== winnerCode
        ? awayCode
        : null;
  if (loserCode) {
    const loserId = teamByCountry.get(loserCode);
    if (loserId && loserId !== winnerTeamId) return loserId;
  }
  return resolveMatchLoserTeamId(
    {
      matchCode: match.match_code,
      label: match.match_code,
      groupCode: match.group_code,
      winnerTeamId,
      homeTeamId: teamByCountry.get(homeCode) ?? null,
      awayTeamId: teamByCountry.get(awayCode) ?? null,
      stageCode: match.stage_code,
    },
    teams,
  );
}

export function detectUniformPointsDelta(input: {
  beforeRows: PilotStandingsRow[];
  afterRows: PilotStandingsRow[];
  pointGainers?: ScoreImpactPointGainer[];
}): number | null {
  const afterById = new Map(input.afterRows.map((row) => [row.participantId, row.totalPoints]));
  const deltas: number[] = [];

  for (const before of input.beforeRows) {
    const afterPoints = afterById.get(before.participantId);
    if (afterPoints == null) continue;
    const delta = afterPoints - before.totalPoints;
    if (delta > 0) deltas.push(delta);
  }

  if (deltas.length === 0) return null;
  const first = deltas[0]!;
  if (!deltas.every((delta) => delta === first)) return null;

  if (input.pointGainers && input.pointGainers.length > 0) {
    const gainerDelta = input.pointGainers[0]!.pointsGained;
    if (gainerDelta !== first) return null;
  }

  return first;
}

export function classifyUpsetImpact(input: {
  before: BracketPathSnapshot;
  after: BracketPathSnapshot;
  pickedUpsetWinner: boolean;
  pickedEliminatedTeam: boolean;
}): BracketImpactUpsetLabel {
  const livePathsDelta = input.after.livePathCount - input.before.livePathCount;
  const championLost = input.before.championAlive && !input.after.championAlive;
  const finalistLost =
    input.before.finalistPathAlive && !input.after.finalistPathAlive;
  const semifinalistLost =
    input.before.semifinalistPathAlive && !input.after.semifinalistPathAlive;

  if (championLost || (livePathsDelta < 0 && input.pickedEliminatedTeam)) {
    return "hurt";
  }
  if (input.pickedUpsetWinner) return "benefited";
  if (livePathsDelta > 0) return "benefited";
  if (livePathsDelta < 0 || finalistLost || semifinalistLost) return "hurt";
  return "neutral";
}

function buildSummary(rows: BracketImpactParticipantRow[]): BracketImpactSummaryMetadata {
  let championLostCount = 0;
  let finalistLostCount = 0;
  let upsetWinnerKeptCount = 0;
  let benefitedCount = 0;
  let hurtCount = 0;

  for (const row of rows) {
    if (row.championAliveBefore && !row.championAliveAfter) championLostCount += 1;
    if (row.finalistPathAliveBefore && !row.finalistPathAliveAfter) finalistLostCount += 1;
    if (row.pickedUpsetWinner) upsetWinnerKeptCount += 1;
    if (row.upsetImpact === "benefited") benefitedCount += 1;
    if (row.upsetImpact === "hurt") hurtCount += 1;
  }

  const winners = pickBiggestBracketImpactWinners(rows, BIGGEST_IMPACT_LIMIT);
  const losers = pickBiggestBracketImpactLosers(rows, BIGGEST_IMPACT_LIMIT);

  return {
    champion_lost_count: championLostCount,
    finalist_lost_count: finalistLostCount,
    upset_winner_kept_count: upsetWinnerKeptCount,
    benefited_count: benefitedCount,
    hurt_count: hurtCount,
    biggest_winners: winners.map((row) => ({
      display_name: row.displayName,
      live_paths_delta: row.livePathsDelta,
    })),
    biggest_losers: losers.map((row) => ({
      display_name: row.displayName,
      live_paths_delta: row.livePathsDelta,
    })),
  };
}

export function pickBiggestBracketImpactWinners(
  rows: BracketImpactParticipantRow[],
  limit = BIGGEST_IMPACT_LIMIT,
): BracketImpactParticipantRow[] {
  return [...rows]
    .filter((row) => row.livePathsDelta > 0 || row.upsetImpact === "benefited")
    .sort((a, b) => {
      const deltaDiff = b.livePathsDelta - a.livePathsDelta;
      if (deltaDiff !== 0) return deltaDiff;
      if (a.upsetImpact !== b.upsetImpact) {
        return a.upsetImpact === "benefited" ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    })
    .slice(0, limit);
}

export function pickBiggestBracketImpactLosers(
  rows: BracketImpactParticipantRow[],
  limit = BIGGEST_IMPACT_LIMIT,
): BracketImpactParticipantRow[] {
  return [...rows]
    .filter(
      (row) =>
        row.livePathsDelta < 0 ||
        row.upsetImpact === "hurt" ||
        (row.championAliveBefore && !row.championAliveAfter),
    )
    .sort((a, b) => {
      const championLossA = a.championAliveBefore && !a.championAliveAfter ? 1 : 0;
      const championLossB = b.championAliveBefore && !b.championAliveAfter ? 1 : 0;
      if (championLossB !== championLossA) return championLossB - championLossA;
      const deltaDiff = a.livePathsDelta - b.livePathsDelta;
      if (deltaDiff !== 0) return deltaDiff;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    })
    .slice(0, limit);
}

export function buildBracketImpactForPool(input: {
  participantBrackets: ParticipantBracketForExposure[];
  participantNames: ReadonlyMap<string, string>;
  participantPicks: ReadonlyMap<string, ParticipantTeamPicks>;
  championPicks: ChampionPickInput[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  knockoutBracketPicksUnlocked: boolean;
  matchResults: ScoreImpactMatchResult[];
  beforeRows: PilotStandingsRow[];
  afterRows: PilotStandingsRow[];
  pointGainers?: ScoreImpactPointGainer[];
}): BracketImpactResult | null {
  const matchCodes = input.matchResults.map((match) => match.matchCode).filter(Boolean);
  if (matchCodes.length === 0) return null;

  const primaryMatch = input.matchResults[0] ?? null;
  const winnerTeamId = primaryMatch?.winnerTeamId?.trim() || null;
  const afterMatches = input.tournamentMatches;
  const beforeMatches = revertMatchesToBeforeResult(afterMatches, matchCodes);

  const publicPrimary = afterMatches.find((match) => match.match_code === primaryMatch?.matchCode);
  const loserTeamId = winnerTeamId
    ? resolveLoserFromPublicMatch(publicPrimary, winnerTeamId, input.teams)
    : null;

  const beforeEliminated = eliminatedTeamIdsFromMatches(beforeMatches, input.teams);
  const afterEliminated = eliminatedTeamIdsFromMatches(afterMatches, input.teams);

  const rows: BracketImpactParticipantRow[] = [];

  for (const bracket of input.participantBrackets) {
    const participantId = bracket.participantId;
    const displayName = input.participantNames.get(participantId) ?? "Participant";
    const picks = input.participantPicks.get(participantId);

    const before = buildBracketPathSnapshotForParticipant({
      participantId,
      bracket,
      championPicks: input.championPicks,
      teams: input.teams,
      tournamentMatches: beforeMatches,
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
      eliminatedTeamIds: beforeEliminated,
    });
    const after = buildBracketPathSnapshotForParticipant({
      participantId,
      bracket,
      championPicks: input.championPicks,
      teams: input.teams,
      tournamentMatches: afterMatches,
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
      eliminatedTeamIds: afterEliminated,
    });

    const pickedUpsetWinner = Boolean(
      winnerTeamId && picks?.pathTeamIds.has(winnerTeamId),
    );
    const pickedEliminatedTeam = Boolean(
      loserTeamId && picks?.pathTeamIds.has(loserTeamId),
    );

    const upsetImpact = classifyUpsetImpact({
      before,
      after,
      pickedUpsetWinner,
      pickedEliminatedTeam,
    });

    rows.push({
      participantId,
      displayName,
      livePathsBefore: before.livePathCount,
      livePathsAfter: after.livePathCount,
      livePathsDelta: after.livePathCount - before.livePathCount,
      championAliveBefore: before.championAlive,
      championAliveAfter: after.championAlive,
      finalistPathAliveBefore: before.finalistPathAlive,
      finalistPathAliveAfter: after.finalistPathAlive,
      semifinalistPathAliveBefore: before.semifinalistPathAlive,
      semifinalistPathAliveAfter: after.semifinalistPathAlive,
      pickedUpsetWinner,
      pickedEliminatedTeam,
      upsetImpact,
    });
  }

  const hasMeaningfulBracketChange = rows.some(
    (row) =>
      row.livePathsDelta !== 0 ||
      row.championAliveBefore !== row.championAliveAfter ||
      row.finalistPathAliveBefore !== row.finalistPathAliveAfter ||
      row.upsetImpact !== "neutral",
  );

  if (!hasMeaningfulBracketChange) return null;

  const uniformPointsDelta = detectUniformPointsDelta({
    beforeRows: input.beforeRows,
    afterRows: input.afterRows,
    pointGainers: input.pointGainers,
  });

  return {
    rows,
    summary: buildSummary(rows),
    uniformPointsDelta,
    winnerTeamId,
    loserTeamId,
    hasMeaningfulBracketChange,
  };
}

export function bracketImpactToMetadata(
  result: BracketImpactResult,
): BracketImpactActivityMetadata {
  return {
    match_winner_team_id: result.winnerTeamId ?? undefined,
    match_loser_team_id: result.loserTeamId ?? undefined,
    uniform_points_delta: result.uniformPointsDelta ?? undefined,
    summary: result.summary,
    rows: result.rows.map(
      (row): BracketImpactParticipantMetadata => ({
        participant_id: row.participantId,
        live_paths_before: row.livePathsBefore,
        live_paths_after: row.livePathsAfter,
        live_paths_delta: row.livePathsDelta,
        champion_alive_before: row.championAliveBefore,
        champion_alive_after: row.championAliveAfter,
        finalist_path_alive_before: row.finalistPathAliveBefore,
        finalist_path_alive_after: row.finalistPathAliveAfter,
        semifinalist_path_alive_before: row.semifinalistPathAliveBefore,
        semifinalist_path_alive_after: row.semifinalistPathAliveAfter,
        picked_upset_winner: row.pickedUpsetWinner,
        picked_eliminated_team: row.pickedEliminatedTeam,
        upset_impact: row.upsetImpact,
      }),
    ),
  };
}

export function parseBracketImpactParticipantRows(
  metadata: Record<string, unknown>,
): Map<string, BracketImpactParticipantRow> {
  const map = new Map<string, BracketImpactParticipantRow>();
  const raw = metadata.bracket_impact;
  if (raw == null || typeof raw !== "object") return map;

  const bracketImpact = raw as BracketImpactActivityMetadata;
  const rows = bracketImpact.rows;
  if (!Array.isArray(rows)) return map;

  for (const row of rows) {
    if (row == null || typeof row !== "object") continue;
    const participantId =
      typeof row.participant_id === "string" ? row.participant_id.trim() : "";
    if (!participantId) continue;

    map.set(participantId, {
      participantId,
      displayName: "Participant",
      livePathsBefore: Number(row.live_paths_before) || 0,
      livePathsAfter: Number(row.live_paths_after) || 0,
      livePathsDelta: Number(row.live_paths_delta) || 0,
      championAliveBefore: row.champion_alive_before === true,
      championAliveAfter: row.champion_alive_after === true,
      finalistPathAliveBefore: row.finalist_path_alive_before === true,
      finalistPathAliveAfter: row.finalist_path_alive_after === true,
      semifinalistPathAliveBefore: row.semifinalist_path_alive_before === true,
      semifinalistPathAliveAfter: row.semifinalist_path_alive_after === true,
      pickedUpsetWinner: row.picked_upset_winner === true,
      pickedEliminatedTeam: row.picked_eliminated_team === true,
      upsetImpact:
        row.upset_impact === "benefited" || row.upset_impact === "hurt"
          ? row.upset_impact
          : "neutral",
    });
  }

  return map;
}
