import type { PoolPaymentSettings } from "@/lib/pools/poolPayment";
import { formatParticipantEntryFee } from "@/lib/pools/poolPayment";

type Props = {
  poolPayment: PoolPaymentSettings;
  paymentInstructions?: string | null;
};

export function DashboardUnpaidWarning({ poolPayment, paymentInstructions }: Props) {
  const entryFee = formatParticipantEntryFee(poolPayment);
  const instructions = paymentInstructions?.trim();

  return (
    <section
      className="rounded-xl border border-amber-700/50 bg-amber-950/25 p-4"
      role="status"
    >
      <h2 className="text-sm font-semibold text-ash-text">Payment required</h2>
      <p className="mt-1 text-sm text-ash-muted">
        Entry fee for this pool: <span className="font-medium text-ash-text">{entryFee}</span>
        . Contact your organizer to complete payment.
      </p>
      {instructions ? (
        <p className="mt-2 text-xs leading-relaxed text-ash-muted">{instructions}</p>
      ) : null}
    </section>
  );
}
