/** Short English relative time for server-rendered feeds (America-neutral). */
export function formatRelativeTimeEn(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((nowMs - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) {
    const m = Math.max(1, Math.floor(sec / 60));
    return `${m}m ago`;
  }
  if (sec < 86400) {
    const h = Math.max(1, Math.floor(sec / 3600));
    return `${h}h ago`;
  }
  const d = Math.floor(sec / 86400);
  if (d < 14) return `${d}d ago`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
