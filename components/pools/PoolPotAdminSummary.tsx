import {
  computePoolPotSummary,
  type PoolPotSummary,
} from "@/lib/pools/computePoolPotSummary";
import {
  formatMoneyAmount,
  POOL_POT_ADMIN_HELPER,
  type PoolPaymentSettings,
} from "@/lib/pools/poolPayment";

type PoolPotAdminSummaryProps = {
  poolPayment: PoolPaymentSettings;
  participants: readonly { paid: boolean }[];
};

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight
          ? "border-ash-accent/40 bg-ash-accent/10"
          : "border-ash-border bg-ash-body/40"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ash-text">{value}</p>
    </div>
  );
}

export function buildPoolPotAdminSummary(
  poolPayment: PoolPaymentSettings,
  participants: readonly { paid: boolean }[],
): PoolPotSummary {
  return computePoolPotSummary(participants, poolPayment.entryFeeAmount);
}

export function PoolPotAdminSummary({
  poolPayment,
  participants,
}: PoolPotAdminSummaryProps) {
  const pot = buildPoolPotAdminSummary(poolPayment, participants);
  const { currencyCode } = poolPayment;
  const fmt = (n: number | null) =>
    formatMoneyAmount(n, currencyCode) ?? "—";

  return (
    <section className="ash-surface space-y-3 p-4">
      <h2 className="text-sm font-bold text-ash-text">Pot summary</h2>
      <p className="text-xs text-ash-muted">{POOL_POT_ADMIN_HELPER}</p>
      {poolPayment.entryFeeAmount == null ? (
        <p className="text-sm text-amber-200">
          Set an entry fee amount in pool settings to calculate pot totals.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Current pot" value={fmt(pot.currentPot)} highlight />
        <Stat label="Potential pot" value={fmt(pot.potentialPot)} />
        <Stat label="Outstanding" value={fmt(pot.unpaidAmount)} />
        <Stat
          label="Paid participants"
          value={String(pot.paidCount)}
        />
        <Stat
          label="Unpaid participants"
          value={String(pot.unpaidCount)}
        />
        <Stat
          label="Active participants"
          value={String(pot.totalActiveCount)}
        />
      </div>
    </section>
  );
}
