/** YYYY-MM-DD in America/Edmonton (matches schedule copy elsewhere). */
export function recapCalendarDateYmdEdmonton(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Earliest instant (ISO) on the Edmonton calendar day containing `date`. */
export function edmontonDayStartIso(date = new Date()): string {
  const ymd = recapCalendarDateYmdEdmonton(date);
  let lo = date.getTime() - 48 * 3600_000;
  let hi = date.getTime();
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (recapCalendarDateYmdEdmonton(new Date(mid)) === ymd) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return new Date(hi).toISOString();
}
