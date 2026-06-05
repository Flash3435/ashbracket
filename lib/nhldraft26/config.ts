/** Public copy for the NHL Draft 2026 Pick'em section. */
export const NHL_DRAFT26_EVENT = {
  draftDateLabel: "Friday, June 26, 2026",
  picksDeadlineSummary: "Submit your top 10 before the first pick is made.",
  prospectPoolNote:
    "Prospect list below is 2026 draft seed data — rankings will be updated again closer to draft day.",
} as const;

export const NHL_DRAFT26_PICK_COUNT = 10;

/** Participant-facing lock deadline (NHL draft day, Eastern Time). */
export const NHL_DRAFT26_PICKS_LOCK_TIMEZONE = "America/New_York";

export const NHL_DRAFT26_PICKS_LOCK_FRIENDLY = "Picks lock before Round 1 begins.";

/**
 * ISO timestamp when pick entry closes (UTC). Server actions enforce this — do not rely on client checks alone.
 */
export const NHL_DRAFT26_PICKS_LOCK_AT = "2026-06-26T17:00:00.000Z";

export function isNhlDraft26PicksLocked(nowMs: number = Date.now()): boolean {
  const t = new Date(NHL_DRAFT26_PICKS_LOCK_AT).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs >= t;
}

type NhlDraft26PicksLockLabelStyle = "compact" | "long";

function normalizeNhlDraft26PicksLockInstant(): Date | null {
  const d = new Date(NHL_DRAFT26_PICKS_LOCK_AT);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Formatted lock instant in Eastern Time for public pages (landing + picks). */
export function formatNhlDraft26PicksLockAtLabel(
  opts?: { style?: NhlDraft26PicksLockLabelStyle },
): string {
  const d = normalizeNhlDraft26PicksLockInstant();
  if (!d) return NHL_DRAFT26_PICKS_LOCK_AT;

  const style = opts?.style ?? "compact";
  if (style === "long") {
    const datePart = new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: NHL_DRAFT26_PICKS_LOCK_TIMEZONE,
    }).format(d);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: NHL_DRAFT26_PICKS_LOCK_TIMEZONE,
    })
      .format(d)
      .toLowerCase()
      .replace(/\s/g, " ");
    return `${datePart} at ${timePart} Eastern Time`;
  }

  const formatted = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: NHL_DRAFT26_PICKS_LOCK_TIMEZONE,
  }).format(d);
  return `${formatted} ET`;
}

/** Shared public deadline copy derived from config (summary + formatted lock time). */
export function getNhlDraft26PicksDeadlineDisplay(): {
  summary: string;
  friendlyLockPhrase: string;
  lockAtLabel: string;
} {
  return {
    summary: NHL_DRAFT26_EVENT.picksDeadlineSummary,
    friendlyLockPhrase: NHL_DRAFT26_PICKS_LOCK_FRIENDLY,
    lockAtLabel: formatNhlDraft26PicksLockAtLabel(),
  };
}
