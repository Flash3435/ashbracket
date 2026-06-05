import {
  formatPoolLockDeadline,
  formatPoolLockDeadlineTimeOnly,
  poolLockDeadlineCalendarKey,
} from "../datetime/poolLockDeadline";
import { poolLocked } from "../pools/poolLocked";

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

function knockoutEditDetail(knockoutBracketPicksUnlocked: boolean): string {
  if (knockoutBracketPicksUnlocked) {
    return "Knockout bracket picks are still editable.";
  }
  return "Knockout bracket picks open when the official Round of 32 is published.";
}

function buildOpenCopy(args: {
  lockAtIso: string;
  deadlineLabel: string;
  relative: string;
  knockoutBracketPicksUnlocked: boolean;
  nowMs: number;
  readOnly: boolean;
}): Pick<PoolPickDeadlineStatus, "headline" | "detail" | "chipLabel" | "tone"> {
  const {
    lockAtIso,
    deadlineLabel,
    relative,
    knockoutBracketPicksUnlocked,
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
    if (knockoutBracketPicksUnlocked) {
      detailParts.push("Knockout bracket picks are open too.");
    } else {
      detailParts.push(
        "Knockout bracket picks are separate — they open when the official Round of 32 is published.",
      );
    }
  } else if (!knockoutBracketPicksUnlocked) {
    detailParts.push(
      "Knockout bracket picks open when the official Round of 32 is published.",
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
  knockoutBracketPicksUnlocked: boolean;
  readOnly: boolean;
}): Pick<PoolPickDeadlineStatus, "headline" | "detail" | "chipLabel" | "tone"> {
  const { deadlineLabel, knockoutBracketPicksUnlocked, readOnly } = args;
  const headline = "Group & bonus picks locked";
  const lockedWhen = deadlineLabel
    ? `Locked on ${deadlineLabel}.`
    : "The pick deadline has passed.";
  const detail = readOnly
    ? `${lockedWhen} ${
        knockoutBracketPicksUnlocked
          ? "Knockout bracket picks may still change."
          : "Knockout bracket picks open when the official Round of 32 is published."
      }`
    : `${lockedWhen} ${knockoutEditDetail(knockoutBracketPicksUnlocked)}`;
  return {
    headline,
    detail,
    chipLabel: "locked",
    tone: "locked",
  };
}

/**
 * Participant-facing deadline / lock messaging for World Cup pool picks.
 * Presentation only — uses the same `poolLocked` check as save enforcement.
 */
export function buildPoolPickDeadlineStatus(input: {
  lockAtIso: string | null | undefined;
  knockoutBracketPicksUnlocked?: boolean;
  /** Another participant’s read-only view — neutral copy. */
  readOnly?: boolean;
  nowMs?: number;
}): PoolPickDeadlineStatus {
  const knockoutBracketPicksUnlocked =
    input.knockoutBracketPicksUnlocked !== false;
  const readOnly = input.readOnly === true;
  const nowMs = input.nowMs ?? Date.now();
  const lockAtIso = input.lockAtIso?.trim() || null;
  const preKnockoutLocked = poolLocked(lockAtIso);

  if (!lockAtIso) {
    return {
      preKnockoutLocked: false,
      headline: "No pick deadline set",
      detail: readOnly
        ? "This pool has no pick deadline on file."
        : knockoutBracketPicksUnlocked
          ? "You can edit your picks until your organizer sets a deadline."
          : "You can edit group, third-place, and bonus picks until a deadline is set. Knockout bracket picks open when the official Round of 32 is published.",
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
        knockoutBracketPicksUnlocked,
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
      knockoutBracketPicksUnlocked,
      nowMs,
      readOnly,
    }),
  };
}
