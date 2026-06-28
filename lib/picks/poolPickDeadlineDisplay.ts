import {
  formatPoolLockDeadline,
  formatPoolLockDeadlineTimeOnly,
  poolLockDeadlineCalendarKey,
} from "../datetime/poolLockDeadline";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  formatGradualKnockoutStatusLine,
  getGradualKnockoutSelectionState,
  hasEditableKnockoutPicks,
  isFullKnockoutBracketPicksUnlocked,
} from "./gradualKnockoutUnlock";

export type PoolPickDeadlineTone = "open" | "soon" | "locked" | "neutral";

export type PoolPickDeadlineStatus = {
  /** Pre-knockout picks frozen (pool `lock_at` has passed). */
  preKnockoutLocked: boolean;
  /** Primary line, e.g. "Picks lock in 2 days". */
  headline: string;
  /** Editability / stage-unlock context. */
  detail: string | null;
  /** Short chip, e.g. "in 2 days", "today", "locked", "open". */
  chipLabel: string;
  /** Formatted deadline when set (Eastern Time). */
  deadlineLabel: string | null;
  tone: PoolPickDeadlineTone;
};

function easternCalendarKey(ms: number): string {
  return poolLockDeadlineCalendarKey(ms);
}

/** Participant-facing deadline label (Eastern Time). */
export function formatPoolPickDeadlineLabel(lockAtIso: string): string {
  return formatPoolLockDeadline(lockAtIso, { style: "compact" });
}

/** Short forward-looking relative label for a future instant. Empty when far out. */
export function formatRelativeTimeUntilEn(
  iso: string,
  nowMs = Date.now(),
): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((t - nowMs) / 1000);
  if (sec <= 0) return "locked";
  if (easternCalendarKey(t) === easternCalendarKey(nowMs)) return "today";
  if (sec < 3600) {
    const m = Math.max(1, Math.round(sec / 60));
    return m === 1 ? "in 1 minute" : `in ${m} minutes`;
  }
  if (sec < 86400) {
    const h = Math.max(1, Math.round(sec / 3600));
    return h === 1 ? "in 1 hour" : `in ${h} hours`;
  }
  const d = Math.floor(sec / 86400);
  if (d === 1) return "in 1 day";
  if (d < 14) return `in ${d} days`;
  return "";
}

function resolveKnockoutEditContext(input: {
  knockoutBracketPicksUnlocked: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  nowMs: number;
}): {
  knockoutEditable: boolean;
  fullBracketPicksUnlocked: boolean;
  gradualStatusLine: string | null;
} {
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    nowMs: input.nowMs,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });
  const fullBracketPicksUnlocked = isFullKnockoutBracketPicksUnlocked({
    officialRoundOf32Complete: input.knockoutBracketPicksUnlocked,
    gradual,
  });
  const knockoutEditable = hasEditableKnockoutPicks({
    gradual,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });
  const gradualStatusLine = formatGradualKnockoutStatusLine(gradual);
  return { knockoutEditable, fullBracketPicksUnlocked, gradualStatusLine };
}

function knockoutEditDetail(args: {
  knockoutEditable: boolean;
  fullBracketPicksUnlocked: boolean;
  gradualStatusLine: string | null;
}): string {
  if (args.fullBracketPicksUnlocked && args.knockoutEditable) {
    return "Knockout bracket picks are still editable.";
  }
  if (args.gradualStatusLine) {
    return `${args.gradualStatusLine}. Each match locks at kickoff.`;
  }
  if (args.knockoutEditable) {
    return "Confirmed knockout matchups can be picked as they become available.";
  }
  return "Knockout bracket picks open as official Round of 32 matchups are confirmed.";
}

function buildOpenCopy(args: {
  lockAtIso: string;
  deadlineLabel: string;
  relative: string;
  fullBracketPicksUnlocked: boolean;
  knockoutEditable: boolean;
  gradualStatusLine: string | null;
  nowMs: number;
  readOnly: boolean;
}): Pick<PoolPickDeadlineStatus, "headline" | "detail" | "chipLabel" | "tone"> {
  const {
    lockAtIso,
    deadlineLabel,
    relative,
    fullBracketPicksUnlocked,
    knockoutEditable,
    gradualStatusLine,
    nowMs,
    readOnly,
  } = args;
  const t = new Date(lockAtIso).getTime();
  const secUntil = Math.round((t - nowMs) / 1000);
  const isToday = relative === "today";
  const timeOnly = formatPoolLockDeadlineTimeOnly(lockAtIso);

  let headline: string;
  let chipLabel: string;
  let tone: PoolPickDeadlineTone = "open";

  if (isToday) {
    headline = timeOnly
      ? `Picks lock today at ${timeOnly}`
      : "Picks lock today";
    chipLabel = "today";
    if (secUntil < 86400) tone = "soon";
  } else if (relative && relative !== "locked") {
    headline = `Picks lock ${relative}`;
    chipLabel = relative.replace(/^in /, "");
    if (secUntil < 86400) tone = "soon";
  } else {
    headline = `Deadline: ${deadlineLabel}`;
    chipLabel = "open";
  }

  const detailParts = readOnly
    ? [`This pool’s pick deadline is ${deadlineLabel}.`]
    : ["You can edit group stage, third-place, and bonus picks until then."];
  if (!readOnly) {
    if (fullBracketPicksUnlocked && knockoutEditable) {
      detailParts.push("Knockout bracket picks are open too.");
    } else if (knockoutEditable) {
      detailParts.push(
        "Knockout bracket picks are separate — confirmed Round of 32 matchups unlock gradually as the official bracket is published.",
      );
      if (gradualStatusLine) detailParts.push(gradualStatusLine);
    } else {
      detailParts.push(
        "Knockout bracket picks are separate — they open as official Round of 32 matchups are confirmed.",
      );
    }
  } else if (!knockoutEditable) {
    detailParts.push(
      "Knockout bracket picks open as official Round of 32 matchups are confirmed.",
    );
  }

  return {
    headline,
    detail: detailParts.join(" "),
    chipLabel,
    tone,
  };
}

function buildLockedCopy(args: {
  deadlineLabel: string | null;
  knockoutEditable: boolean;
  readOnly: boolean;
}): Pick<PoolPickDeadlineStatus, "headline" | "detail" | "chipLabel" | "tone"> {
  const { deadlineLabel, knockoutEditable, readOnly } = args;
  const headline = "Group & bonus picks locked";
  let detail: string;
  if (deadlineLabel) {
    detail = readOnly
      ? `These picks locked on ${deadlineLabel}.`
      : `These picks locked on ${deadlineLabel}. You can review them, but they can no longer be edited.`;
  } else {
    detail = readOnly
      ? "The pick deadline has passed."
      : "The pick deadline has passed. You can review these picks, but they can no longer be edited.";
  }
  if (!readOnly && knockoutEditable) {
    detail += " Knockout bracket picks are still editable.";
  }
  return {
    headline,
    detail,
    chipLabel: "locked",
    tone: "locked",
  };
}

/** Whether pre-knockout picks are frozen at `nowMs` (matches save enforcement semantics). */
export function isPreKnockoutLockedAt(
  lockAtIso: string | null | undefined,
  nowMs: number,
): boolean {
  if (lockAtIso == null || lockAtIso.trim() === "") return false;
  const t = new Date(lockAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

/**
 * Participant-facing deadline / lock messaging for World Cup pool picks.
 * Presentation only — uses the same lock instant comparison as save enforcement.
 */
export function buildPoolPickDeadlineStatus(input: {
  lockAtIso: string | null | undefined;
  knockoutBracketPicksUnlocked?: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  /** Another participant’s read-only view — neutral copy. */
  readOnly?: boolean;
  nowMs?: number;
}): PoolPickDeadlineStatus {
  const knockoutBracketPicksUnlocked =
    input.knockoutBracketPicksUnlocked !== false;
  const readOnly = input.readOnly === true;
  const nowMs = input.nowMs ?? Date.now();
  const lockAtIso = input.lockAtIso?.trim() || null;
  const preKnockoutLocked = isPreKnockoutLockedAt(lockAtIso, nowMs);
  const { knockoutEditable, fullBracketPicksUnlocked, gradualStatusLine } =
    resolveKnockoutEditContext({
    knockoutBracketPicksUnlocked,
    tournamentMatches: input.tournamentMatches,
    nowMs,
  });

  if (!lockAtIso) {
    return {
      preKnockoutLocked: false,
      headline: "No pick deadline has been set by the organizer yet.",
      detail: readOnly
        ? "The organizer has not set a pick deadline for this pool yet."
        : fullBracketPicksUnlocked
          ? "You can edit your picks until your organizer sets a deadline."
          : knockoutEditable
            ? `You can edit group, third-place, and bonus picks until a deadline is set. ${knockoutEditDetail({ knockoutEditable, fullBracketPicksUnlocked, gradualStatusLine })}`
            : "You can edit group, third-place, and bonus picks until a deadline is set. Knockout bracket picks open as official Round of 32 matchups are confirmed.",
      chipLabel: "open",
      deadlineLabel: null,
      tone: "neutral",
    };
  }

  const deadlineLabel = formatPoolPickDeadlineLabel(lockAtIso);
  const hasValidDeadline = deadlineLabel !== "";

  if (preKnockoutLocked) {
    return {
      preKnockoutLocked: true,
      deadlineLabel: hasValidDeadline ? deadlineLabel : null,
      ...buildLockedCopy({
        deadlineLabel: hasValidDeadline ? deadlineLabel : null,
        knockoutEditable,
        readOnly,
      }),
    };
  }

  const relative = formatRelativeTimeUntilEn(lockAtIso, nowMs);
  return {
    preKnockoutLocked: false,
    deadlineLabel: hasValidDeadline ? deadlineLabel : null,
    ...buildOpenCopy({
      lockAtIso,
      deadlineLabel: hasValidDeadline ? deadlineLabel : lockAtIso,
      relative,
      fullBracketPicksUnlocked,
      knockoutEditable,
      gradualStatusLine,
      nowMs,
      readOnly,
    }),
  };
}
