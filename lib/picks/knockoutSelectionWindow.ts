import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { kickoffSortMs } from "../tournament/sortTournamentMatches";
import {
  getGradualKnockoutSelectionState,
  type GradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";

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

export const KNOCKOUT_EXPECTED_UNLOCK_LINE =
  "Expected unlock: after the final group-stage match";

export type KnockoutSelectionInstructionCardModel = {
  phase: KnockoutSelectionPhase;
  title: string;
  body: string;
  /** Static expected-unlock context (upcoming phase only). */
  expectedUnlockLine: string;
  /**
   * Final group-stage kickoff ISO for client-local time display.
   * Omit server-side formatting — Vercel renders in UTC.
   */
  expectedUnlockKickoffIso: string | null;
  /** Live countdown row; omitted when the target is unknown or expired in upcoming phase. */
  countdown: KnockoutSelectionCountdownLine | null;
  /** Shown when upcoming phase has no reliable countdown target. */
  upcomingFallbackLine: string | null;
  cta: { label: string; href: string } | null;
  helperText: string | null;
  tone: "upcoming" | "open" | "locking";
  /** Gradual unlock counts for dashboard surfaces. */
  gradualStatusLine: string | null;
  gradual: GradualKnockoutSelectionState;
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

function formatGradualStatusLine(gradual: GradualKnockoutSelectionState): string | null {
  if (gradual.allR32Confirmed) return null;
  if (gradual.confirmedCount === 0) return null;
  return `${gradual.pickableCount} confirmed matchups available · ${gradual.pendingCount} waiting for confirmation`;
}

export function buildGradualR32PickableCardBody(
  pickableCount: number,
): string {
  const matchupWord = pickableCount === 1 ? "matchup is" : "matchups are";
  return `${pickableCount} confirmed ${matchupWord} available now. More matchups will unlock as the official bracket fills in. Each match locks at kickoff.`;
}

export const KNOCKOUT_BRACKET_GRADUAL_SECTION_COPY =
  "Confirmed Round of 32 matchups are opening gradually. Later knockout rounds unlock once the full official bracket is set.";

export function buildKnockoutBracketGradualSectionNote(readOnly: boolean): string {
  if (readOnly) {
    return `${KNOCKOUT_BRACKET_GRADUAL_SECTION_COPY} Knockout picks and scoring follow confirmed FIFA bracket slots.`;
  }
  return `${KNOCKOUT_BRACKET_GRADUAL_SECTION_COPY} Pick confirmed matchups now and check back as more unlock.`;
}

export function buildKnockoutSelectionInstructionCard(input: {
  knockoutBracketPicksUnlocked: boolean;
  matches: TournamentMatchPublicRow[] | null | undefined;
  picksHref: string;
  picksLocked?: boolean;
  nowMs?: number;
}): KnockoutSelectionInstructionCardModel {
  const nowMs = input.nowMs ?? Date.now();
  const schedule = deriveKnockoutSelectionSchedule(input.matches, nowMs);
  const picksHref = input.picksHref.trim() || "/account/picks";
  const gradual = getGradualKnockoutSelectionState({
    matches: input.matches,
    nowMs,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });
  const gradualStatusLine = formatGradualStatusLine(gradual);

  const lockingPhase = gradual.anyR32Started || schedule.firstRoundOf32Started;

  if (lockingPhase) {
    return {
      phase: "locking",
      title: "Knockout picks are now locking",
      body: "Matches lock at kickoff. You can still make or update picks for future matches that have not started yet.",
      expectedUnlockLine: "",
      expectedUnlockKickoffIso: null,
      countdown: null,
      upcomingFallbackLine: null,
      cta: { label: "Review picks", href: picksHref },
      helperText: null,
      tone: "locking",
      gradualStatusLine,
      gradual,
    };
  }

  if (gradual.allR32Confirmed) {
    const closeIso =
      gradual.earliestPickableKickoffIso ?? schedule.earliestRoundOf32KickoffIso;
    const closeExpired =
      closeIso != null && selectionCountdownExpired(closeIso, nowMs);

    return {
      phase: "open",
      title: "Knockout picks are open",
      body: "The official Round of 32 is set. Pick the winners through the bracket before matches begin.",
      expectedUnlockLine: "",
      expectedUnlockKickoffIso: null,
      countdown:
        closeIso && !closeExpired
          ? { label: "First match locks in", targetIso: closeIso }
          : null,
      upcomingFallbackLine:
        !closeIso || closeExpired
          ? "Submit your full bracket as soon as possible. Individual matches lock at kickoff."
          : null,
      cta: { label: "Make knockout picks", href: picksHref },
      helperText:
        "Submit your full bracket as soon as possible. Individual matches lock at kickoff.",
      tone: "open",
      gradualStatusLine: null,
      gradual,
    };
  }

  if (gradual.pickableCount > 0 || gradual.confirmedCount > 0) {
    const countdownTarget =
      gradual.earliestPickableKickoffIso ?? schedule.expectedUnlockAtIso;
    const hasCountdownTarget = countdownTarget != null;
    const countdownExpired =
      hasCountdownTarget && selectionCountdownExpired(countdownTarget, nowMs);

    if (gradual.pickableCount > 0) {
      return {
        phase: "open",
        title: "Round of 32 picks are opening gradually",
        body: buildGradualR32PickableCardBody(gradual.pickableCount),
        expectedUnlockLine: "",
        expectedUnlockKickoffIso: null,
        countdown:
          gradual.earliestPickableKickoffIso && !countdownExpired
            ? {
                label: "First available match locks in",
                targetIso: gradual.earliestPickableKickoffIso,
              }
            : null,
        upcomingFallbackLine: null,
        cta: { label: "Make Round of 32 picks", href: picksHref },
        helperText: input.picksLocked
          ? "Group and bonus picks are locked, but confirmed knockout matchups can still be picked."
          : "Each match locks at kickoff. Submit confirmed picks now and check back as more matchups unlock.",
        tone: "open",
        gradualStatusLine,
        gradual,
      };
    }

    return {
      phase: "upcoming",
      title: "Knockout picks are opening gradually",
      body: "Confirmed Round of 32 matchups can be picked as they become available. Matchups that are not official yet will unlock once the bracket is confirmed.",
      expectedUnlockLine: "",
      expectedUnlockKickoffIso: null,
      countdown:
        hasCountdownTarget && !countdownExpired
          ? { label: "Selections open in", targetIso: countdownTarget! }
          : null,
      upcomingFallbackLine:
        !hasCountdownTarget || countdownExpired
          ? "Confirmed matchups unlock as the official bracket is published"
          : null,
      cta: { label: "Make knockout picks", href: picksHref },
      helperText:
        "Each match locks at kickoff. Submit confirmed picks now and check back as more matchups unlock.",
      tone: "upcoming",
      gradualStatusLine,
      gradual,
    };
  }

  const hasCountdownTarget = schedule.expectedUnlockAtIso != null;
  const countdownExpired =
    hasCountdownTarget &&
    selectionCountdownExpired(schedule.expectedUnlockAtIso, nowMs);

  return {
    phase: "upcoming",
    title: "Knockout picks open after the group stage",
    body: "The Round of 32 depends on final group standings, including the best third-place teams. Once the official matchups are known, this page will unlock.",
    expectedUnlockLine: KNOCKOUT_EXPECTED_UNLOCK_LINE,
    expectedUnlockKickoffIso: schedule.finalGroupKickoffIso,
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
    gradualStatusLine: null,
    gradual,
  };
}
