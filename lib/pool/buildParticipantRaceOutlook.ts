import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import { isKnockoutProgressionKind } from "@/lib/predictions/knockoutProgressionKinds";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ParticipantBracketForExposure } from "./buildKnockoutMatchExposure";
import {
  buildPathValidRaceOutlookForParticipant,
  type PathValidRemainingPick,
} from "./buildPathValidRaceOutlookForParticipant";

export type RaceOutlookStatus =
  | "Leading"
  | "Close behind"
  | "In contention"
  | "Long shot"
  | "Champion dead";

/** Headline tournament picks shown in leaderboard Details (presentation only). */
export const REMAINING_TOURNAMENT_PICK_KEYS = [
  "champion",
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
] as const;

export type RemainingTournamentPickKey =
  (typeof REMAINING_TOURNAMENT_PICK_KEYS)[number];

export type RemainingTournamentPick = {
  key: RemainingTournamentPickKey;
  teamId: string | null;
  teamName: string | null;
};

export type ParticipantRaceOutlookRow = {
  participantId: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  championTeamName: string | null;
  championTeamCode: string | null;
  championAlive: boolean;
  hasChampionPick: boolean;
  pathValidLivePickCount: number;
  topRemainingPicks: PathValidRemainingPick[];
  /** Champion + bonus picks for compact Details (from already-loaded slots). */
  remainingTournamentPicks: RemainingTournamentPick[];
  statusLabel: RaceOutlookStatus;
  leaderDisplayName: string;
  leaderLivePathCount: number | null;
  pointsBehindLeader: number;
  /**
   * When false, Tournament Picks Details still render, but race-status badges and
   * path-valid impact copy are omitted (participants outside the top-N race cut).
   */
  showRaceStatus: boolean;
};

export type ParticipantRaceOutlook = {
  rows: ParticipantRaceOutlookRow[];
};

export type ResolvedChampionPick = {
  teamId: string;
  teamName: string;
  teamCode: string | null;
  hasChampionPick: boolean;
};

export const RACE_OUTLOOK_TOP_N = 10;
export const CLOSE_BEHIND_POINTS_BEHIND = 3;
export const IN_CONTENTION_POINTS_BEHIND = 8;
export const MEANINGFUL_PATH_VALID_PICKS_MIN = 1;

/**
 * @deprecated Naive global-survival counter; kept for regression tests only.
 */
export function countLiveKnockoutPicksRemaining(
  slots: KnockoutPickSlotDraft[],
  eliminatedTeamIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const slot of slots) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;
    const teamId = slot.teamId.trim();
    if (!teamId) continue;
    if (eliminatedTeamIds.has(teamId)) continue;
    count += 1;
  }
  return count;
}

/**
 * Resolve champion + default bonus picks from already-loaded bracket slots.
 * No settlement/status — presentation names only.
 */
export function resolveRemainingTournamentPicks(input: {
  champion: ResolvedChampionPick;
  bracketSlots: KnockoutPickSlotDraft[];
  teams: Team[];
}): RemainingTournamentPick[] {
  const teamNameById = new Map(
    input.teams.map((t) => [t.id, t.name?.trim() || "Unknown team"] as const),
  );

  function bonusTeam(bonusKey: RemainingTournamentPickKey): RemainingTournamentPick {
    const slot = input.bracketSlots.find(
      (s) =>
        s.predictionKind === "bonus_pick" &&
        (s.bonusKey ?? "").trim() === bonusKey,
    );
    const teamId = slot?.teamId.trim() || null;
    return {
      key: bonusKey,
      teamId,
      teamName: teamId ? teamNameById.get(teamId) ?? "Unknown team" : null,
    };
  }

  return [
    {
      key: "champion",
      teamId: input.champion.hasChampionPick ? input.champion.teamId : null,
      teamName: input.champion.hasChampionPick ? input.champion.teamName : null,
    },
    bonusTeam("most_goals"),
    bonusTeam("most_yellow_cards"),
    bonusTeam("most_red_cards"),
  ];
}

export function resolveChampionPickForParticipant(input: {
  participantId: string;
  championPicks: ChampionPickInput[];
  bracketSlots: KnockoutPickSlotDraft[];
  teams: Team[];
}): ResolvedChampionPick {
  const fromChampionPicks = input.championPicks.find(
    (pick) => pick.participantId === input.participantId && pick.teamId.trim(),
  );
  if (fromChampionPicks?.teamId.trim()) {
    return {
      teamId: fromChampionPicks.teamId.trim(),
      teamName: fromChampionPicks.teamName?.trim() || "Unknown team",
      teamCode: fromChampionPicks.teamCode?.trim() || null,
      hasChampionPick: true,
    };
  }

  const champSlot = input.bracketSlots.find(
    (slot) => slot.predictionKind === "champion" && slot.teamId.trim(),
  );
  const teamId = champSlot?.teamId.trim() ?? "";
  if (!teamId) {
    return {
      teamId: "",
      teamName: "",
      teamCode: null,
      hasChampionPick: false,
    };
  }

  const team = input.teams.find((t) => t.id === teamId);
  return {
    teamId,
    teamName: team?.name?.trim() || "Unknown team",
    teamCode: team?.countryCode?.trim() || null,
    hasChampionPick: true,
  };
}

export function resolveRaceOutlookStatus(input: {
  rank: number;
  hasChampionPick: boolean;
  championPathDead: boolean;
  pathValidLivePickCount: number;
  pointsBehindLeader: number;
}): RaceOutlookStatus {
  if (input.rank === 1) return "Leading";
  if (input.hasChampionPick && input.championPathDead) return "Champion dead";
  if (
    input.pathValidLivePickCount >= MEANINGFUL_PATH_VALID_PICKS_MIN &&
    input.pointsBehindLeader <= CLOSE_BEHIND_POINTS_BEHIND
  ) {
    return "Close behind";
  }
  if (
    input.pathValidLivePickCount >= MEANINGFUL_PATH_VALID_PICKS_MIN &&
    input.pointsBehindLeader <= IN_CONTENTION_POINTS_BEHIND
  ) {
    return "In contention";
  }
  return "Long shot";
}

function sortLeaderboardRows(rows: LeaderboardPublicRow[]): LeaderboardPublicRow[] {
  return [...rows].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName) ||
      a.participantId.localeCompare(b.participantId),
  );
}

function selectRaceOutlookParticipantIds(input: {
  leaderboardRows: LeaderboardPublicRow[];
  viewerParticipantId?: string | null;
  topN?: number;
}): string[] {
  const topN = input.topN ?? RACE_OUTLOOK_TOP_N;
  const sorted = sortLeaderboardRows(input.leaderboardRows);
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const row of sorted) {
    if (seen.has(row.participantId)) continue;
    selected.push(row.participantId);
    seen.add(row.participantId);
    if (selected.length >= topN) break;
  }

  const viewerId = input.viewerParticipantId?.trim() || null;
  if (viewerId && !seen.has(viewerId)) {
    selected.push(viewerId);
  }

  return selected;
}

/**
 * Participant-centered race outlook for leaderboard-visible participants.
 * Path-valid counts use official match results and bracket path resolution.
 *
 * Every leaderboard participant gets Tournament Picks Details from already-loaded
 * brackets. Expensive path-valid status (badges / live-path impact) stays limited
 * to the top-N cut plus the signed-in viewer when outside that cut.
 */
export function buildParticipantRaceOutlook(input: {
  leaderboardRows: LeaderboardPublicRow[];
  participantBrackets: ParticipantBracketForExposure[];
  championPicks: ChampionPickInput[];
  eliminatedTeamIds: ReadonlySet<string>;
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[];
  knockoutBracketPicksUnlocked: boolean;
  viewerParticipantId?: string | null;
  topN?: number;
}): ParticipantRaceOutlook {
  const bracketByParticipantId = new Map(
    input.participantBrackets.map((b) => [b.participantId, b]),
  );

  const sortedLeaderboard = sortLeaderboardRows(input.leaderboardRows);
  const leaderLeaderboardRow = sortedLeaderboard[0];
  const leaderPoints = leaderLeaderboardRow?.totalPoints ?? 0;
  const leaderDisplayName = leaderLeaderboardRow?.displayName ?? "";

  let leaderLivePathCount: number | null = null;
  if (leaderLeaderboardRow) {
    const leaderBracket = bracketByParticipantId.get(leaderLeaderboardRow.participantId);
    if (leaderBracket) {
      const leaderChampion = resolveChampionPickForParticipant({
        participantId: leaderLeaderboardRow.participantId,
        championPicks: input.championPicks,
        bracketSlots: leaderBracket.slots,
        teams: input.teams,
      });
      const leaderPathOutlook = buildPathValidRaceOutlookForParticipant({
        slots: leaderBracket.slots,
        teams: input.teams,
        tournamentMatches: input.tournamentMatches,
        knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
        championTeamId: leaderChampion.hasChampionPick ? leaderChampion.teamId : null,
      });
      leaderLivePathCount = leaderPathOutlook.pathValidLivePickCount;
    }
  }

  const pathValidParticipantIds = new Set(
    selectRaceOutlookParticipantIds({
      leaderboardRows: input.leaderboardRows,
      viewerParticipantId: input.viewerParticipantId,
      topN: input.topN,
    }),
  );

  const rows: ParticipantRaceOutlookRow[] = [];
  const seen = new Set<string>();

  for (const leaderboardRow of sortedLeaderboard) {
    const participantId = leaderboardRow.participantId;
    if (seen.has(participantId)) continue;
    seen.add(participantId);

    const bracket = bracketByParticipantId.get(participantId);
    const slots = bracket?.slots ?? [];
    const includePathValid = pathValidParticipantIds.has(participantId);

    const champion = resolveChampionPickForParticipant({
      participantId,
      championPicks: input.championPicks,
      bracketSlots: slots,
      teams: input.teams,
    });

    const remainingTournamentPicks = resolveRemainingTournamentPicks({
      champion,
      bracketSlots: slots,
      teams: input.teams,
    });

    const pointsBehindLeader = leaderPoints - leaderboardRow.totalPoints;
    const hasChampionPick = champion.hasChampionPick;

    if (includePathValid && bracket) {
      const pathOutlook = buildPathValidRaceOutlookForParticipant({
        slots,
        teams: input.teams,
        tournamentMatches: input.tournamentMatches,
        knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
        championTeamId: hasChampionPick ? champion.teamId : null,
      });

      const championPathDead =
        hasChampionPick &&
        (pathOutlook.championPathDead ||
          input.eliminatedTeamIds.has(champion.teamId));
      const championAlive = hasChampionPick && !championPathDead;

      rows.push({
        participantId,
        displayName: leaderboardRow.displayName,
        rank: leaderboardRow.rank,
        totalPoints: leaderboardRow.totalPoints,
        championTeamName: hasChampionPick ? champion.teamName : null,
        championTeamCode: hasChampionPick ? champion.teamCode : null,
        championAlive,
        hasChampionPick,
        pathValidLivePickCount: pathOutlook.pathValidLivePickCount,
        topRemainingPicks: pathOutlook.topRemainingPicks,
        remainingTournamentPicks,
        leaderDisplayName,
        leaderLivePathCount,
        pointsBehindLeader,
        statusLabel: resolveRaceOutlookStatus({
          rank: leaderboardRow.rank,
          hasChampionPick,
          championPathDead,
          pathValidLivePickCount: pathOutlook.pathValidLivePickCount,
          pointsBehindLeader,
        }),
        showRaceStatus: true,
      });
      continue;
    }

    // Light Details-only row: reuse already-loaded slots; skip path-valid CPU.
    const championEliminated =
      hasChampionPick && input.eliminatedTeamIds.has(champion.teamId);
    rows.push({
      participantId,
      displayName: leaderboardRow.displayName,
      rank: leaderboardRow.rank,
      totalPoints: leaderboardRow.totalPoints,
      championTeamName: hasChampionPick ? champion.teamName : null,
      championTeamCode: hasChampionPick ? champion.teamCode : null,
      championAlive: hasChampionPick && !championEliminated,
      hasChampionPick,
      pathValidLivePickCount: 0,
      topRemainingPicks: [],
      remainingTournamentPicks,
      leaderDisplayName,
      leaderLivePathCount,
      pointsBehindLeader,
      statusLabel: "Long shot",
      showRaceStatus: false,
    });
  }

  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName),
  );

  return { rows };
}
