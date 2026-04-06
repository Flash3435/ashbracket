/** Calgary / Alberta local time for published kickoffs (DB stores UTC). */
export const ASHBRACKET_SCHEDULE_TIMEZONE = "America/Edmonton";

export type KickoffEdmontonParts = {
  dateLine: string;
  timeLine: string;
  singleLineFallback: string;
};

/**
 * Splits an ISO instant into calendar date and clock time in America/Edmonton.
 */
export function formatKickoffAmericaEdmonton(
  iso: string | null | undefined,
): KickoffEdmontonParts {
  if (iso == null || iso === "") {
    return {
      dateLine: "",
      timeLine: "",
      singleLineFallback: "Time TBD",
    };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateLine: "", timeLine: "", singleLineFallback: iso };
  }

  const dateLine = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASHBRACKET_SCHEDULE_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);

  const timeLine = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASHBRACKET_SCHEDULE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);

  return { dateLine, timeLine, singleLineFallback: "" };
}
