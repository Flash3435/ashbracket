/** Calgary / Alberta — admin/internal schedule copy only, not participant kickoff display. */
export const ASHBRACKET_SCHEDULE_TIMEZONE = "America/Edmonton";

export type KickoffDisplayParts = {
  dateLine: string;
  timeLine: string;
  singleLineFallback: string;
};

/** @deprecated Use KickoffDisplayParts */
export type KickoffEdmontonParts = KickoffDisplayParts;

export type FormatKickoffOptions = {
  /** Pin display to an IANA zone (tests/admin). Omit for the runtime local zone. */
  timeZone?: string;
};

function kickoffPartsFromDate(
  d: Date,
  options?: FormatKickoffOptions,
): Pick<KickoffDisplayParts, "dateLine" | "timeLine"> {
  const tz: Intl.DateTimeFormatOptions = options?.timeZone
    ? { timeZone: options.timeZone }
    : {};

  const dateLine = new Intl.DateTimeFormat("en-CA", {
    ...tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);

  const timeLine = new Intl.DateTimeFormat("en-CA", {
    ...tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);

  return { dateLine, timeLine };
}

/**
 * Splits an ISO instant into calendar date and clock time in the viewer's local zone
 * (or an explicit IANA zone when provided).
 */
export function formatKickoffLocal(
  iso: string | null | undefined,
  options?: FormatKickoffOptions,
): KickoffDisplayParts {
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

  const { dateLine, timeLine } = kickoffPartsFromDate(d, options);
  return { dateLine, timeLine, singleLineFallback: "" };
}

export function formatKickoffLocalSingleLine(
  iso: string | null | undefined,
  options?: FormatKickoffOptions,
): string {
  const parts = formatKickoffLocal(iso, options);
  if (parts.singleLineFallback) return parts.singleLineFallback;
  return `${parts.dateLine} · ${parts.timeLine}`;
}

/** Clock time only in the viewer's local zone (or an explicit IANA zone). */
export function formatKickoffTimeOnly(
  iso: string | null | undefined,
  options?: FormatKickoffOptions,
): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return kickoffPartsFromDate(d, options).timeLine;
}

/**
 * Fixed America/Edmonton display for admin/internal tooling.
 * Participant schedule UI should use formatKickoffLocal / KickoffTimeDisplay instead.
 */
export function formatKickoffAmericaEdmonton(
  iso: string | null | undefined,
): KickoffDisplayParts {
  return formatKickoffLocal(iso, { timeZone: ASHBRACKET_SCHEDULE_TIMEZONE });
}
