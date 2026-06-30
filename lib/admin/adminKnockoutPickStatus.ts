import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { formatKickoffLocalSingleLine } from "../datetime/scheduleDisplay";
import {
  buildGradualR32MatchPickRows,
  getGradualKnockoutSelectionState,
} from "../picks/gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
  usesKnockoutMatchPickRows,
  validatedKnockoutMatchWinner,
} from "../picks/knockoutMatchPickRows";
import {
  buildKnockoutMatchProgress,
  resolveKnockoutProgressContext,
  type KnockoutProgressContext,
  type ResolvedKnockoutProgressContext,
} from "../picks/knockoutMatchProgress";
import {
  formatKnockoutSelectionCountdown,
  isMatchStarted,
} from "../picks/knockoutSelectionWindow";
import { kickoffSortMs } from "../tournament/sortTournamentMatches";

export type AdminKnockoutCompletionStatus =
  | "complete"
  | "incomplete"
  | "not_started"
  | "missing_next_matchday";

export type AdminKnockoutStageBreakdown = {
  roundOf32: number;
  roundOf16: number;
  quarterFinals: number;
  semiFinals: number;
  finalChampion: number;
};

export type AdminKnockoutUrgentMatch = {
  fifaMatchNo: number;
  matchLabel: string;
  kickoffIso: string | null;
  kickoffLocal: string;
};

export type AdminKnockoutParticipantStatus = {
  participantId: string;
  displayName: string;
  status: AdminKnockoutCompletionStatus;
  missingCount: number;
  stageBreakdown: AdminKnockoutStageBreakdown;
  lockedMissingLabels: string[];
  nextUrgentMatch: AdminKnockoutUrgentMatch | null;
  /** Earliest kickoff among pickable missing matches (for sorting). */
  urgentKickoffMs: number | null;
  hasR32PickableMissing: boolean;
};

export type AdminKnockoutPickStatusPanelState =
  | "no_participants"
  | "not_applicable"
  | "ready"
  | "unavailable";

export type AdminKnockoutPickStatusPanelData = {
  poolId: string;
  poolName: string;
  state: AdminKnockoutPickStatusPanelState;
  completeCount: number;
  incompleteCount: number;
  summaryLine: string;
  firstMatchLockLabel: string | null;
  nextLockingMatchLabel: string | null;
  incompleteParticipants: AdminKnockoutParticipantStatus[];
  completeParticipants: AdminKnockoutParticipantStatus[];
  knockoutBracketPicksUnlocked: boolean;
  statusUnavailableReason: string | null;
};

export type BuildAdminKnockoutPickStatusInput = {
  poolId: string;
  poolName: string;
  participants: Array<{ id: string; displayName: string }>;
  slotsByParticipantId: Map<string, KnockoutPickSlotDraft[]>;
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  nowMs?: number;
  statusAvailable?: boolean;
  statusUnavailableReason?: string | null;
};

type MissingMatchRef = {
  stage: keyof AdminKnockoutStageBreakdown;
  fifaMatchNo: number;
  matchLabel: string;
  kickoffIso: string | null;
  lockReason: "pickable" | "started";
};

const STAGE_KEY_FOR_BRACKET: Record<string, keyof AdminKnockoutStageBreakdown> = {
  round_of_32: "roundOf32",
  round_of_16: "roundOf16",
  quarterfinalist: "quarterFinals",
  semifinalist: "semiFinals",
  finalist: "finalChampion",
  champion: "finalChampion",
};

const LATER_BRACKET_KINDS: KnockoutWizardBracketKind[] = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
];

function emptyStageBreakdown(): AdminKnockoutStageBreakdown {
  return {
    roundOf32: 0,
    roundOf16: 0,
    quarterFinals: 0,
    semiFinals: 0,
    finalChampion: 0,
  };
}

function teamName(teamId: string | null, teams: Team[]): string | null {
  if (!teamId?.trim()) return null;
  return teams.find((t) => t.id === teamId.trim())?.name?.trim() ?? null;
}

function matchLabelFromParts(
  fifaMatchNo: number,
  homeTeamId: string | null,
  awayTeamId: string | null,
  teams: Team[],
  fallbackLine?: string | null,
): string {
  const home = teamName(homeTeamId, teams);
  const away = teamName(awayTeamId, teams);
  if (home && away) return `M${fifaMatchNo} ${home} vs ${away}`;
  const matchup = fallbackLine?.trim();
  if (matchup && !matchup.includes("Complete")) return `M${fifaMatchNo} ${matchup}`;
  return `M${fifaMatchNo}`;
}

function matchLabelFromRow(
  row: Pick<KnockoutMatchPickRow, "fifaMatchNo" | "homeTeamId" | "awayTeamId" | "display">,
  teams: Team[],
): string {
  return matchLabelFromParts(
    row.fifaMatchNo,
    row.homeTeamId,
    row.awayTeamId,
    teams,
    row.display.emptyPrimaryLine,
  );
}

function gradualRowHasWinner(
  row: ReturnType<typeof buildGradualR32MatchPickRows>[number],
): boolean {
  return Boolean(row.winnerTeamId?.trim());
}

function analyzeGradualR32Missing(
  ctx: ResolvedKnockoutProgressContext,
  teams: Team[],
): MissingMatchRef[] {
  const rows = buildGradualR32MatchPickRows({
    slots: ctx.slots,
    state: ctx.gradual,
    teams,
    fullRoundOf32Official: ctx.officialRoundOf32Complete,
  });
  const missing: MissingMatchRef[] = [];
  for (const row of rows) {
    if (row.lockReason !== "pickable" && row.lockReason !== "started") continue;
    if (gradualRowHasWinner(row)) continue;
    missing.push({
      stage: "roundOf32",
      fifaMatchNo: row.fifaMatchNo,
      matchLabel: matchLabelFromParts(
        row.fifaMatchNo,
        ctx.gradual.matchStates[row.matchIndex]?.homeTeamId ?? null,
        ctx.gradual.matchStates[row.matchIndex]?.awayTeamId ?? null,
        teams,
        row.display.emptyPrimaryLine,
      ),
      kickoffIso: row.display.kickoffIso,
      lockReason: row.lockReason === "started" ? "started" : "pickable",
    });
  }
  return missing;
}

function analyzeLaterRoundMissing(
  ctx: ResolvedKnockoutProgressContext,
  teams: Team[],
): MissingMatchRef[] {
  const missing: MissingMatchRef[] = [];
  for (const bracketKind of LATER_BRACKET_KINDS) {
    if (!usesKnockoutMatchPickRows(bracketKind, true)) continue;
    const rows = buildKnockoutMatchPickRows({
      bracketKind,
      slots: ctx.slots,
      teams,
      tournamentMatches: ctx.tournamentMatches,
      gradual: ctx.gradual,
      knockoutBracketPicksUnlocked: ctx.officialRoundOf32Complete,
      nowMs: ctx.nowMs,
    });
    for (const row of rows) {
      if (row.lockReason === "incomplete" || row.lockReason === "frozen") continue;
      if (validatedKnockoutMatchWinner(row)) continue;
      const stage =
        STAGE_KEY_FOR_BRACKET[bracketKind] ?? "roundOf16";
      missing.push({
        stage,
        fifaMatchNo: row.fifaMatchNo,
        matchLabel: matchLabelFromRow(row, teams),
        kickoffIso: row.kickoffIso,
        lockReason: row.lockReason === "started" ? "started" : "pickable",
      });
    }
  }
  return missing;
}

function analyzeKnockoutMissing(
  ctx: ResolvedKnockoutProgressContext,
  teams: Team[],
): MissingMatchRef[] {
  const missing: MissingMatchRef[] = [];
  if (ctx.gradualR32MatchRows || ctx.gradualR32Pickable) {
    missing.push(...analyzeGradualR32Missing(ctx, teams));
  }
  if (ctx.fullBracketPicksUnlocked) {
    missing.push(...analyzeLaterRoundMissing(ctx, teams));
  }
  return missing;
}

function stageBreakdownFromMissing(
  pickableMissing: MissingMatchRef[],
): AdminKnockoutStageBreakdown {
  const breakdown = emptyStageBreakdown();
  for (const m of pickableMissing) {
    breakdown[m.stage] += 1;
  }
  return breakdown;
}

function resolveCompletionStatus(
  progress: ReturnType<typeof buildKnockoutMatchProgress>,
  pickableMissing: MissingMatchRef[],
  lockedMissing: MissingMatchRef[],
  nextPoolLockingMatch: PoolLockingMatch | null,
): AdminKnockoutCompletionStatus {
  if (
    progress.complete &&
    pickableMissing.length === 0 &&
    lockedMissing.length === 0
  ) {
    return "complete";
  }
  if (progress.filled === 0 && pickableMissing.length === 0 && lockedMissing.length === 0) {
    return "not_started";
  }
  if (
    nextPoolLockingMatch &&
    pickableMissing.some((m) => m.fifaMatchNo === nextPoolLockingMatch.fifaMatchNo)
  ) {
    return "missing_next_matchday";
  }
  return "incomplete";
}

function earliestUrgentMatch(
  pickableMissing: MissingMatchRef[],
): AdminKnockoutUrgentMatch | null {
  const sorted = [...pickableMissing].sort((a, b) => {
    const am = a.kickoffIso ? kickoffSortMs(a.kickoffIso) : Number.POSITIVE_INFINITY;
    const bm = b.kickoffIso ? kickoffSortMs(b.kickoffIso) : Number.POSITIVE_INFINITY;
    return am - bm;
  });
  const next = sorted[0];
  if (!next) return null;
  return {
    fifaMatchNo: next.fifaMatchNo,
    matchLabel: next.matchLabel,
    kickoffIso: next.kickoffIso,
    kickoffLocal: next.kickoffIso
      ? formatKickoffLocalSingleLine(next.kickoffIso)
      : "Time TBD",
  };
}

export function buildAdminKnockoutParticipantStatus(
  participantId: string,
  displayName: string,
  slots: KnockoutPickSlotDraft[],
  context: KnockoutProgressContext & { nowMs?: number },
  options?: {
    nextPoolLockingMatch?: PoolLockingMatch | null;
    teams?: Team[];
  },
): AdminKnockoutParticipantStatus {
  const teams = options?.teams ?? context.teams;
  const ctx = resolveKnockoutProgressContext(context);
  const progress = buildKnockoutMatchProgress(context);
  const allMissing = analyzeKnockoutMissing(ctx, teams);
  const pickableMissing = allMissing.filter((m) => m.lockReason === "pickable");
  const lockedMissing = allMissing.filter((m) => m.lockReason === "started");
  const stageBreakdown = stageBreakdownFromMissing(pickableMissing);
  const urgentKickoffMs =
    pickableMissing
      .map((m) => (m.kickoffIso ? kickoffSortMs(m.kickoffIso) : Number.POSITIVE_INFINITY))
      .sort((a, b) => a - b)[0] ?? null;
  const normalizedUrgentKickoffMs =
    urgentKickoffMs === Number.POSITIVE_INFINITY ? null : urgentKickoffMs;

  return {
    participantId,
    displayName,
    status: resolveCompletionStatus(
      progress,
      pickableMissing,
      lockedMissing,
      options?.nextPoolLockingMatch ?? null,
    ),
    missingCount: pickableMissing.length,
    stageBreakdown,
    lockedMissingLabels: lockedMissing.map((m) => `M${m.fifaMatchNo}`),
    nextUrgentMatch: earliestUrgentMatch(pickableMissing),
    urgentKickoffMs: normalizedUrgentKickoffMs,
    hasR32PickableMissing: pickableMissing.some((m) => m.stage === "roundOf32"),
  };
}

export type PoolLockingMatch = {
  fifaMatchNo: number;
  matchLabel: string;
  kickoffIso: string;
};

export function findNextPoolLockingMatch(input: {
  tournamentMatches: TournamentMatchPublicRow[] | null;
  teams: Team[];
  officialRoundOf32Complete: boolean;
  nowMs?: number;
}): PoolLockingMatch | null {
  const nowMs = input.nowMs ?? Date.now();
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs,
    fullRoundOf32Official: input.officialRoundOf32Complete,
  });

  const candidates: Array<{
    fifaMatchNo: number;
    kickoffIso: string;
    homeId: string | null;
    awayId: string | null;
    fallbackLine: string | null;
  }> = [];

  for (const ms of gradual.matchStates) {
    if (!ms.pickable || !ms.kickoffAtIso) continue;
    if (isMatchStarted(ms.publicMatch ?? { kickoff_at: ms.kickoffAtIso, status: "scheduled" }, nowMs)) {
      continue;
    }
    candidates.push({
      fifaMatchNo: ms.fifaMatchNo,
      kickoffIso: ms.kickoffAtIso,
      homeId: ms.homeTeamId,
      awayId: ms.awayTeamId,
      fallbackLine:
        ms.publicMatch?.home_team_name && ms.publicMatch?.away_team_name
          ? `${ms.publicMatch.home_team_name} vs ${ms.publicMatch.away_team_name}`
          : null,
    });
  }

  if (input.officialRoundOf32Complete) {
    for (const bracketKind of LATER_BRACKET_KINDS) {
      if (!usesKnockoutMatchPickRows(bracketKind, true)) continue;
      const rows = buildKnockoutMatchPickRows({
        bracketKind,
        slots: [],
        teams: input.teams,
        tournamentMatches: input.tournamentMatches,
        gradual,
        knockoutBracketPicksUnlocked: true,
        nowMs,
      });
      for (const row of rows) {
        if (row.lockReason !== "pickable" || !row.kickoffIso) continue;
        candidates.push({
          fifaMatchNo: row.fifaMatchNo,
          kickoffIso: row.kickoffIso,
          homeId: row.homeTeamId,
          awayId: row.awayTeamId,
          fallbackLine: row.display.emptyPrimaryLine,
        });
      }
    }
  }

  const upcoming = candidates
    .filter((c) => kickoffSortMs(c.kickoffIso) > nowMs)
    .sort((a, b) => kickoffSortMs(a.kickoffIso) - kickoffSortMs(b.kickoffIso));

  const next = upcoming[0];
  if (!next) return null;

  return {
    fifaMatchNo: next.fifaMatchNo,
    kickoffIso: next.kickoffIso,
    matchLabel: matchLabelFromParts(
      next.fifaMatchNo,
      next.homeId,
      next.awayId,
      input.teams,
      next.fallbackLine,
    ),
  };
}

export function findEarliestUpcomingLockKickoff(input: {
  tournamentMatches: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  teams: Team[];
  nowMs?: number;
}): string | null {
  const next = findNextPoolLockingMatch(input);
  return next?.kickoffIso ?? null;
}

export function sortAdminKnockoutParticipants(
  participants: AdminKnockoutParticipantStatus[],
): AdminKnockoutParticipantStatus[] {
  return [...participants].sort((a, b) => {
    const aUrgent = a.urgentKickoffMs ?? Number.POSITIVE_INFINITY;
    const bUrgent = b.urgentKickoffMs ?? Number.POSITIVE_INFINITY;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    if (a.hasR32PickableMissing !== b.hasR32PickableMissing) {
      return a.hasR32PickableMissing ? -1 : 1;
    }
    if (a.missingCount !== b.missingCount) return b.missingCount - a.missingCount;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function formatAdminKnockoutStatusLabel(
  status: AdminKnockoutCompletionStatus,
): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "not_started":
      return "Not started";
    case "missing_next_matchday":
      return "Missing picks for next matchday";
    case "incomplete":
      return "Incomplete";
  }
}

export function formatAdminKnockoutReminderCopy(input: {
  participantName: string;
  poolName: string;
  urgentMatch?: AdminKnockoutUrgentMatch | null;
}): string {
  if (input.urgentMatch) {
    return `Hi ${input.participantName}, you still need to pick ${input.urgentMatch.matchLabel}. It locks at ${input.urgentMatch.kickoffLocal}. Please update your AshBracket picks before kickoff.`;
  }
  return `Hi ${input.participantName}, you still have knockout picks to complete in ${input.poolName}. Some matches lock at kickoff, so please update your AshBracket picks as soon as possible.`;
}

function knockoutTrackingActive(input: {
  tournamentMatches: TournamentMatchPublicRow[] | null;
  officialRoundOf32Complete: boolean;
  teams: Team[];
  nowMs: number;
}): boolean {
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    nowMs: input.nowMs,
    fullRoundOf32Official: input.officialRoundOf32Complete,
  });
  return gradual.pickableCount > 0 || input.officialRoundOf32Complete;
}

export function buildAdminKnockoutPickStatusPanelData(
  input: BuildAdminKnockoutPickStatusInput,
): AdminKnockoutPickStatusPanelData {
  const nowMs = input.nowMs ?? Date.now();
  const statusAvailable = input.statusAvailable !== false;

  if (!statusAvailable) {
    return {
      poolId: input.poolId,
      poolName: input.poolName,
      state: "unavailable",
      completeCount: 0,
      incompleteCount: 0,
      summaryLine: "—",
      firstMatchLockLabel: null,
      nextLockingMatchLabel: null,
      incompleteParticipants: [],
      completeParticipants: [],
      knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
      statusUnavailableReason:
        input.statusUnavailableReason ??
        "Knockout pick status is unavailable right now.",
    };
  }

  if (input.participants.length === 0) {
    return {
      poolId: input.poolId,
      poolName: input.poolName,
      state: "no_participants",
      completeCount: 0,
      incompleteCount: 0,
      summaryLine: "No participants yet",
      firstMatchLockLabel: null,
      nextLockingMatchLabel: null,
      incompleteParticipants: [],
      completeParticipants: [],
      knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
      statusUnavailableReason: null,
    };
  }

  const trackingActive = knockoutTrackingActive({
    tournamentMatches: input.tournamentMatches,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    teams: input.teams,
    nowMs,
  });

  if (!trackingActive) {
    return {
      poolId: input.poolId,
      poolName: input.poolName,
      state: "not_applicable",
      completeCount: 0,
      incompleteCount: 0,
      summaryLine: "Knockout picks not open yet",
      firstMatchLockLabel: null,
      nextLockingMatchLabel: null,
      incompleteParticipants: [],
      completeParticipants: [],
      knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
      statusUnavailableReason: null,
    };
  }

  const nextLockingMatch = findNextPoolLockingMatch({
    tournamentMatches: input.tournamentMatches,
    teams: input.teams,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    nowMs,
  });

  const earliestKickoff = findEarliestUpcomingLockKickoff({
    tournamentMatches: input.tournamentMatches,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    teams: input.teams,
    nowMs,
  });

  const progressContextBase: Omit<KnockoutProgressContext, "slots"> = {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    officialRoundOf32Complete: input.officialRoundOf32Complete,
    nowMs,
  };

  const allStatuses = input.participants.map((p) =>
    buildAdminKnockoutParticipantStatus(
      p.id,
      p.displayName,
      input.slotsByParticipantId.get(p.id) ?? [],
      { ...progressContextBase, slots: input.slotsByParticipantId.get(p.id) ?? [] },
      { nextPoolLockingMatch: nextLockingMatch, teams: input.teams },
    ),
  );

  const incomplete = sortAdminKnockoutParticipants(
    allStatuses.filter((s) => s.status !== "complete"),
  );
  const complete = allStatuses
    .filter((s) => s.status === "complete")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const completeCount = complete.length;
  const incompleteCount = incomplete.length;
  const summaryLine = `${completeCount} complete · ${incompleteCount} incomplete`;

  const firstMatchLockLabel = earliestKickoff
    ? `First match locks in: ${formatKnockoutSelectionCountdown(earliestKickoff, nowMs)}`
    : null;
  const nextLockingMatchLabel = nextLockingMatch
    ? `Next locking match: ${nextLockingMatch.matchLabel}`
    : null;

  return {
    poolId: input.poolId,
    poolName: input.poolName,
    state: "ready",
    completeCount,
    incompleteCount,
    summaryLine,
    firstMatchLockLabel,
    nextLockingMatchLabel,
    incompleteParticipants: incomplete,
    completeParticipants: complete,
    knockoutBracketPicksUnlocked: input.officialRoundOf32Complete,
    statusUnavailableReason: null,
  };
}
