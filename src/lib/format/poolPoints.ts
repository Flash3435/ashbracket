/** Format a pool score for display (supports fractional ledger totals). */
export function formatPoolPoints(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const x = Math.round(n * 100) / 100;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(x);
}
