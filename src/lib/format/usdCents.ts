/** Formats integer USD cents for display (e.g. 2500 → "$25.00"). */
export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
