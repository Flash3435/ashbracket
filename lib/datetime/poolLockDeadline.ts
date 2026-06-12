/** Official timezone for participant-facing pool pick deadlines. */
export const POOL_LOCK_DEADLINE_TIMEZONE = "America/New_York";

export const POOL_LOCK_DEADLINE_FRIENDLY_LABEL = "Eastern Time";

export const POOL_LOCK_DEADLINE_SHORT_LABEL = "ET";

/** AshBracket 2026 official live-pool pick lock — June 11, 2026 12:00 p.m. Eastern Time. */
export const ASHBRACKET_2026_POOL_LOCK_AT_ISO = "2026-06-11T16:00:00.000Z";

export type PoolLockDeadlineFormatStyle = "compact" | "long";

function normalizeLockInstant(lockAtIso: string | null | undefined): Date | null {
  if (lockAtIso == null || lockAtIso.trim() === "") return null;
  const d = new Date(lockAtIso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Calendar date (YYYY-MM-DD) for a lock instant in Eastern Time. */
export function poolLockDeadlineCalendarKey(
  ms: number,
  timeZone = POOL_LOCK_DEADLINE_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function formatLongPoolLockDeadline(d: Date): string {
  const datePart = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: POOL_LOCK_DEADLINE_TIMEZONE,
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: POOL_LOCK_DEADLINE_TIMEZONE,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s/g, " ");
  return `${datePart} at ${timePart} ${POOL_LOCK_DEADLINE_FRIENDLY_LABEL}`;
}

function formatCompactPoolLockDeadline(d: Date): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: POOL_LOCK_DEADLINE_TIMEZONE,
  }).format(d);
  return `${formatted} ${POOL_LOCK_DEADLINE_SHORT_LABEL}`;
}

/**
 * Participant-facing pool lock deadline label in Eastern Time.
 * - compact: "Jun 10, 2026, 11:59 p.m. ET"
 * - long: "June 10, 2026 at 11:59 p.m. Eastern Time"
 */
export function formatPoolLockDeadline(
  lockAtIso: string | null | undefined,
  opts?: { style?: PoolLockDeadlineFormatStyle },
): string {
  const d = normalizeLockInstant(lockAtIso);
  if (!d) return "";
  const style = opts?.style ?? "compact";
  return style === "long" ? formatLongPoolLockDeadline(d) : formatCompactPoolLockDeadline(d);
}

/** Clock time only in Eastern Time (e.g. "11:59 p.m."). */
export function formatPoolLockDeadlineTimeOnly(
  lockAtIso: string | null | undefined,
): string {
  const d = normalizeLockInstant(lockAtIso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: POOL_LOCK_DEADLINE_TIMEZONE,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s/g, " ");
}
