import { formatKickoffLocalSingleLine } from "../datetime/scheduleDisplay";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { kickoffSortMs } from "../tournament/sortTournamentMatches";

/** Conservative buffer after final group-stage kickoff (90 min + extra time). */
export const GROUP_STAGE_MATCH_DURATION_BUFFER_MS = 105 * 60_000;

export type KnockoutSelectionPhase = "upcoming" | "open" | "locking";

export type KnockoutSelectionSchedule = {
  /** Latest group-stage kickoff instant, if known. */
  finalGroupKickoffIso: string | null;
  /** Estimated unlock after final group match ends. */
  expectedUnlockAtIso: string | null;
  /** Earliest Round of 32 kickoff, if known. */
  earliestRoundOf32KickoffIso: string | null;
  /** Whether any Round of 32 fixture has started (live, finished, or kickoff passed). */
  firstRoundOf32Started: boolean;
};

export type KnockoutSelectionCountdownLine = {
  label: string;
  targetIso: string;
};

export type KnockoutSelectionInstructionCardModel = {
  phase: KnockoutSelectionPhase;
  title: string;
  body: string;
  /** Static metadata (e.g. expected unlock context). */
  expectedUnlockLine: string;
  /** Live countdown row; omitted when the target is unknown or expired in upcoming phase. */
  countdown: KnockoutSelectionCountdownLine | null;
  /** Shown when upcoming phase has no reliable countdown target. */
  upcomingFallbackLine: string | null;
  cta: { label: string; href: string } | null;
  helperText: string | null;
  tone: "upcoming" | "open" | "locking";
};

function groupMatches(
  matches: TournamentMatchPublicRow[],
): TournamentMatchPublicRow[] {
  return matches.filter((m) => m.stage_code === "group");
}

function roundOf32Matches(
  matches: TournamentMatchPublicRow[],
): TournamentMatchPublicRow[] {
  return matches.filter((m) => m.stage_code === "round_of_32");
}

function latestKickoffIso(
  matches: TournamentMatchPublicRow[],
): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const m of matches) {
    const iso = m.kickoff_at?.trim();
    if (!iso) continue;
    const ms = kickoffSortMs(iso);
    if (ms === Number.POSITIVE_INFINITY) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

function earliestKickoffIso(
  matches: TournamentMatchPublicRow[],
): string | null {
  let best: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const m of matches) {
    const iso = m.kickoff_at?.trim();
    if (!iso) continue;
    const ms = kickoffSortMs(iso);
    if (ms === Number.POSITIVE_INFINITY) continue;
    if (ms <= bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

export function isMatchStarted(
  match: Pick<TournamentMatchPublicRow, "kickoff_at" | "status">,
  nowMs = Date.now(),
): boolean {
  if (match.status === "live" || match.status === "finished") return true;
  const iso = match.kickoff_at?.trim();
  if (!iso) return false;
  const ms = kickoffSortMs(iso);
  return ms !== Number.POSITIVE_INFINITY && ms <= nowMs;
}

/** Derive schedule anchors from public tournament match rows. */
export function deriveKnockoutSelectionSchedule(
  matches: TournamentMatchPublicRow[] | null | undefined,
  nowMs = Date.now(),
): KnockoutSelectionSchedule {
  const group = groupMatches(matches ?? []);
  const r32 = roundOf32Matches(matches ?? []);
  const finalGroupKickoffIso = latestKickoffIso(group);
  const expectedUnlockAtIso =
    finalGroupKickoffIso != null
      ? new Date(
          kickoffSortMs(finalGroupKickoffIso) + GROUP_STAGE_MATCH_DURATION_BUFFER_MS,
        ).toISOString()
      : null;
  const earliestRoundOf32KickoffIso = earliestKickoffIso(r32);
  const firstRoundOf32Started = r32.some((m) => isMatchStarted(m, nowMs));

  return {
    finalGroupKickoffIso,
    expectedUnlockAtIso,
    earliestRoundOf32KickoffIso,
    firstRoundOf32Started,
  };
}

export function msUntilTarget(
  targetIso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (targetIso == null || targetIso.trim() === "") return null;
  const t = new Date(targetIso).getTime();
  if (Number.isNaN(t)) return null;
  return t - nowMs;
}

export function selectionCountdownExpired(
  targetIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const ms = msUntilTarget(targetIso, nowMs);
  return ms != null && ms <= 0;
}

/** Countdown fragment only (no label prefix); never negative. */
export function formatKnockoutSelectionCountdown(
  targetIso: string | null | undefined,
  nowMs = Date.now(),
): string {
  const ms = msUntilTarget(targetIso, nowMs);
  if (ms == null) return "soon";
  if (ms <= 0) return "now";

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(hours / 24);
  const hoursInDay = hours % 24;

  if (days >= 1) {
    if (hoursInDay > 0) return `${days}d ${hoursInDay}h`;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (hours >= 1) {
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }
  if (totalMinutes >= 1) return `${totalMinutes}m`;
  return "less than 1 minute";
}

function expectedUnlockMetadataLine(schedule: KnockoutSelectionSchedule): string {
  const kickoffLabel =
    schedule.finalGroupKickoffIso != null
      ? formatKickoffLocalSingleLine(schedule.finalGroupKickoffIso)
      : null;
  if (kickoffLabel && kickoffLabel !== "Time TBD") {
    return `Expected unlock: after the final group-stage match (${kickoffLabel})`;
  }
  return "Expected unlock: after the final group-stage match";
}

export function buildKnockoutSelectionInstructionCard(input: {
  knockoutBracketPicksUnlocked: boolean;
  matches: TournamentMatchPublicRow[] | null | undefined;
  picksHref: string;
  nowMs?: number;
}): KnockoutSelectionInstructionCardModel {
  const nowMs = input.nowMs ?? Date.now();
  const schedule = deriveKnockoutSelectionSchedule(input.matches, nowMs);
  const picksHref = input.picksHref.trim() || "/account/picks";

  if (!input.knockoutBracketPicksUnlocked) {
    const expectedUnlockLine = expectedUnlockMetadataLine(schedule);
    const hasCountdownTarget = schedule.expectedUnlockAtIso != null;
    const countdownExpired =
      hasCountdownTarget &&
      selectionCountdownExpired(schedule.expectedUnlockAtIso, nowMs);

    return {
      phase: "upcoming",
      title: "Knockout picks open after the group stage",
      body: "The Round of 32 depends on final group standings, including the best third-place teams. Once the official matchups are known, this page will unlock.",
      expectedUnlockLine,
      countdown:
        hasCountdownTarget && !countdownExpired
          ? {
              label: "Selections open in",
              targetIso: schedule.expectedUnlockAtIso!,
            }
          : null,
      upcomingFallbackLine:
        !hasCountdownTarget || countdownExpired
          ? "Expected after final group-stage results are official"
          : null,
      cta: null,
      helperText: null,
      tone: "upcoming",
    };
  }

  if (schedule.firstRoundOf32Started) {
    return {
      phase: "locking",
      title: "Knockout picks are now locking",
      body: "Matches lock at kickoff. You can still make or update picks for future matches that have not started yet.",
      expectedUnlockLine: "",
      countdown: null,
      upcomingFallbackLine: null,
      cta: { label: "Review picks", href: picksHref },
      helperText: null,
      tone: "locking",
    };
  }

  const closeIso = schedule.earliestRoundOf32KickoffIso;
  const closeExpired = closeIso != null && selectionCountdownExpired(closeIso, nowMs);

  return {
    phase: "open",
    title: "Knockout picks are open",
    body: "The official Round of 32 is set. Pick the winners through the bracket before matches begin.",
    expectedUnlockLine: "",
    countdown:
      closeIso && !closeExpired
        ? { label: "Selection window closes in", targetIso: closeIso }
        : null,
    upcomingFallbackLine:
      !closeIso || closeExpired
        ? "Submit your full bracket before the first Round of 32 match"
        : null,
    cta: { label: "Make knockout picks", href: picksHref },
    helperText:
      "Submit your full bracket before the first Round of 32 match. Individual match picks lock at kickoff.",
    tone: "open",
  };
}
