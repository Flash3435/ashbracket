import type { PoolPotParticipantSummary } from "@/lib/pools/computePoolPotSummary";
import {
  formatMoneyAmount,
  formatParticipantEntryFee,
  POOL_PAYMENT_DISCLAIMER,
  poolIsPaid,
  type PoolPaymentSettings,
} from "@/lib/pools/poolPayment";

type ParticipantPoolPaymentPanelProps = {
  poolPayment: PoolPaymentSettings;
  isPaid: boolean;
  potSummary?: PoolPotParticipantSummary | null;
  /** Larger banner after joining a paid pool. */
  variant?: "default" | "join_notice";
};

export function ParticipantPoolPaymentPanel({
  poolPayment,
  isPaid: participantPaid,
  potSummary = null,
  variant = "default",
}: ParticipantPoolPaymentPanelProps) {
  if (!poolIsPaid(poolPayment)) return null;

  const entryFee = formatParticipantEntryFee(poolPayment);
  const showInstructions =
    !participantPaid && Boolean(poolPayment.paymentInstructions?.trim());
  const showPot =
    poolPayment.showPotToParticipants &&
    potSummary?.showPot === true &&
    poolPayment.entryFeeAmount != null;

  if (variant === "join_notice" && participantPaid && !showPot) return null;

  const borderClass =
    variant === "join_notice"
      ? "border-amber-700/50 bg-amber-950/25"
      : "border-ash-border bg-ash-surface";

  const currency = poolPayment.currencyCode;

  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${borderClass}`}
      role="status"
    >
      {variant === "join_notice" ? (
        <p className="font-medium text-ash-text">Payment for this pool</p>
      ) : (
        <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          Pool payment
        </p>
      )}

      <dl className="mt-2 space-y-1 text-ash-muted">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ash-text">Your payment status:</dt>
          <dd className="font-medium text-ash-text">
            {participantPaid ? "Paid" : "Unpaid"}
          </dd>
        </div>
        {entryFee ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="sr-only">Your entry fee</dt>
            <dd className="text-ash-text">{entryFee}</dd>
          </div>
        ) : null}
      </dl>

      {showPot ? (
        <dl className="mt-3 space-y-1 border-t border-ash-border/60 pt-3 text-ash-muted">
          <div className="flex flex-wrap gap-x-2">
            <dt>Current pot:</dt>
            <dd className="font-medium text-ash-text">
              {formatMoneyAmount(potSummary?.currentPot ?? null, currency) ??
                "—"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt>Potential pot:</dt>
            <dd className="font-medium text-ash-text">
              {formatMoneyAmount(potSummary?.potentialPot ?? null, currency) ??
                "—"}
            </dd>
          </div>
        </dl>
      ) : null}

      {showInstructions ? (
        <div className="mt-3 whitespace-pre-wrap text-ash-text">
          <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
            Payment instructions
          </p>
          <p className="mt-1">{poolPayment.paymentInstructions}</p>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-ash-muted">{POOL_PAYMENT_DISCLAIMER}</p>
    </div>
  );
}

export function UnpaidPaymentReminderBanner({
  poolPayment,
  isPaid: participantPaid,
}: {
  poolPayment: PoolPaymentSettings;
  isPaid: boolean;
}) {
  if (!poolIsPaid(poolPayment) || participantPaid) return null;

  const entryFee = formatParticipantEntryFee(poolPayment);

  return (
    <p
      className="mb-4 rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
      role="status"
    >
      Payment reminder: you are marked unpaid for this pool
      {entryFee ? ` (${entryFee})` : ""}.
      {poolPayment.paymentInstructions?.trim() ? (
        <>
          {" "}
          See payment instructions on your account page.
        </>
      ) : (
        <> Contact your pool organizer about payment.</>
      )}{" "}
      You can still save picks while unpaid.
    </p>
  );
}
