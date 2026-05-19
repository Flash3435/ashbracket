/** PostgREST / Supabase error when a relation is not in the schema cache yet. */
export function isMissingSchemaObjectError(
  message: string,
  objectName?: string,
): boolean {
  const m = message.toLowerCase();
  const missing =
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("does not exist") ||
    m.includes("relation") && m.includes("does not exist");

  if (!missing) return false;
  if (!objectName) return true;
  return m.includes(objectName.toLowerCase());
}

export const WC_POOL_LEDGER_RECOMPUTE_STATUS_TABLE =
  "wc_pool_ledger_recompute_status";

export const WC_POOL_LEDGER_RECOMPUTE_STATUS_MIGRATION =
  "20260506193000_wc_pool_ledger_recompute_status.sql";

export function wcPoolLedgerRecomputeStatusUnavailableMessage(): string {
  return (
    "Standings “last updated” times are not available on this database yet. " +
    `Apply migration ${WC_POOL_LEDGER_RECOMPUTE_STATUS_MIGRATION} ` +
    `(creates table public.wc_pool_ledger_recompute_status), then refresh this page. ` +
    "Pool lists, snapshots, and the pilot log below still work."
  );
}
