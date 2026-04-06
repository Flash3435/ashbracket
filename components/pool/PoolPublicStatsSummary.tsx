import { formatUsdCents } from "@/lib/format/usdCents";
import type { PoolPublicStats } from "../../lib/pool/fetchPoolPublicStats";

type PoolPublicStatsSummaryProps = {
  poolLabel?: string;
  stats?: PoolPublicStats | null;
  errorMessage?: string | null;
};

export function PoolPublicStatsSummary({
  poolLabel = "Sample pool",
  stats,
  errorMessage,
}: PoolPublicStatsSummaryProps) {
  if (errorMessage) {
    return (
      <section
        className="mb-6 rounded-xl border border-ash-border bg-ash-surface px-4 py-3"
        aria-live="polite"
      >
        <p className="text-xs text-ash-border-hover">{poolLabel}</p>
        <p className="mt-2 text-sm text-amber-200">{errorMessage}</p>
      </section>
    );
  }

  if (!stats) return null;

  const { registeredCount, paidCount, entryFeeCents, prizePoolCents } = stats;

  return (
    <section className="mb-6 rounded-xl border border-ash-border bg-ash-surface px-4 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ash-muted">
        Pool snapshot
      </h2>
      <p className="mt-1 text-xs text-ash-border-hover">{poolLabel}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ash-muted">Registered</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
            {registeredCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ash-muted">Paid entries</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
            {paidCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ash-muted">Prize pool (est.)</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ash-text">
            {entryFeeCents != null && prizePoolCents != null ? (
              formatUsdCents(prizePoolCents)
            ) : (
              <span className="text-sm font-normal text-ash-muted">
                Set when entry fee is configured
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ash-border-hover">
        Counts include everyone registered in the pool. The prize pool is paid
        entries × the published entry fee; individual payment status is not
        shown here.
      </p>
    </section>
  );
}
