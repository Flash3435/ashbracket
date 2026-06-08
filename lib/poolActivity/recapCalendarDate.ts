/** YYYY-MM-DD in America/Edmonton (matches schedule copy elsewhere). */
export function recapCalendarDateYmdEdmonton(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
