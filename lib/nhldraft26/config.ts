/** Static copy for MVP — replace or load from admin when event details are finalized. */
export const NHL_DRAFT26_EVENT = {
  draftDateLabel: "Friday, June 26, 2026 (placeholder)",
  picksDeadlineLabel:
    "Submit your top 10 before the first pick is on the clock. Deadline copy is configurable for launch.",
  prospectPoolNote:
    "Prospect list below is 2026 draft seed data — rankings will be updated again closer to draft day.",
} as const;

export const NHL_DRAFT26_PICK_COUNT = 10;

/**
 * ISO timestamp when pick entry closes (UTC). Update before launch.
 * Server actions enforce this — do not rely on client checks alone.
 */
export const NHL_DRAFT26_PICKS_LOCK_AT = "2026-06-26T17:00:00.000Z";

export function isNhlDraft26PicksLocked(nowMs: number = Date.now()): boolean {
  const t = new Date(NHL_DRAFT26_PICKS_LOCK_AT).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs >= t;
}

export function formatNhlDraft26PicksLockAtLabel(): string {
  const d = new Date(NHL_DRAFT26_PICKS_LOCK_AT);
  if (Number.isNaN(d.getTime())) {
    return NHL_DRAFT26_PICKS_LOCK_AT;
  }
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
