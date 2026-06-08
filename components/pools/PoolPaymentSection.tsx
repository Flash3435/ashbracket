"use client";

import {
  DEFAULT_CURRENCY_CODE,
  DEFAULT_ENTRY_FEE_LABEL,
  POOL_PAYMENT_DISCLAIMER,
  POOL_POT_ADMIN_HELPER,
  SUPPORTED_CURRENCY_CODES,
  type PoolPaymentType,
} from "@/lib/pools/poolPayment";

export type PoolPaymentFormState = {
  paymentType: PoolPaymentType;
  entryFeeLabel: string;
  entryFeeAmount: string;
  paymentInstructions: string;
  currencyCode: string;
  showPotToParticipants: boolean;
};

export function emptyPoolPaymentFormState(): PoolPaymentFormState {
  return {
    paymentType: "free",
    entryFeeLabel: DEFAULT_ENTRY_FEE_LABEL,
    entryFeeAmount: "",
    paymentInstructions: "",
    currencyCode: DEFAULT_CURRENCY_CODE,
    showPotToParticipants: false,
  };
}

export function poolPaymentFormStateFromSettings(settings: {
  paymentType: PoolPaymentType;
  entryFeeLabel: string | null;
  entryFeeAmount: number | null;
  paymentInstructions: string | null;
  currencyCode: string;
  showPotToParticipants: boolean;
}): PoolPaymentFormState {
  return {
    paymentType: settings.paymentType,
    entryFeeLabel: settings.entryFeeLabel ?? DEFAULT_ENTRY_FEE_LABEL,
    entryFeeAmount:
      settings.entryFeeAmount != null ? String(settings.entryFeeAmount) : "",
    paymentInstructions: settings.paymentInstructions ?? "",
    currencyCode: settings.currencyCode,
    showPotToParticipants: settings.showPotToParticipants,
  };
}

type PoolPaymentSectionProps = {
  value: PoolPaymentFormState;
  onChange: (next: PoolPaymentFormState) => void;
  disabled?: boolean;
  validationWarnings?: string[];
};

export function PoolPaymentSection({
  value,
  onChange,
  disabled = false,
  validationWarnings = [],
}: PoolPaymentSectionProps) {
  const isPaid = value.paymentType === "paid";

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="text-xs font-medium uppercase tracking-wide text-ash-muted">
        Pool payment
      </legend>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ash-text">
          <input
            type="radio"
            name="pool-payment-type"
            checked={value.paymentType === "free"}
            onChange={() =>
              onChange({ ...value, paymentType: "free" })
            }
            className="mt-0.5"
          />
          <span>Free pool</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ash-text">
          <input
            type="radio"
            name="pool-payment-type"
            checked={value.paymentType === "paid"}
            onChange={() =>
              onChange({ ...value, paymentType: "paid" })
            }
            className="mt-0.5"
          />
          <span>Paid pool</span>
        </label>
      </div>

      <p className="text-xs text-ash-muted">{POOL_PAYMENT_DISCLAIMER}</p>

      {isPaid ? (
        <div className="space-y-4 rounded-md border border-ash-border bg-ash-body/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="pool-entry-fee-amount"
                className="block text-sm font-medium text-ash-text"
              >
                Entry fee amount{" "}
                <span className="font-normal text-ash-muted">(optional)</span>
              </label>
              <input
                id="pool-entry-fee-amount"
                type="text"
                inputMode="decimal"
                value={value.entryFeeAmount}
                onChange={(e) =>
                  onChange({ ...value, entryFeeAmount: e.target.value })
                }
                placeholder="e.g. 25"
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm focus:border-ash-accent focus:outline-none focus:ring-1 focus:ring-ash-accent disabled:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="pool-currency-code"
                className="block text-sm font-medium text-ash-text"
              >
                Currency
              </label>
              <select
                id="pool-currency-code"
                value={value.currencyCode}
                onChange={(e) =>
                  onChange({ ...value, currencyCode: e.target.value })
                }
                className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm focus:border-ash-accent focus:outline-none focus:ring-1 focus:ring-ash-accent disabled:opacity-50"
              >
                {SUPPORTED_CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="pool-payment-instructions"
              className="block text-sm font-medium text-ash-text"
            >
              Payment instructions{" "}
              <span className="font-normal text-ash-muted">(recommended)</span>
            </label>
            <textarea
              id="pool-payment-instructions"
              rows={4}
              value={value.paymentInstructions}
              onChange={(e) =>
                onChange({ ...value, paymentInstructions: e.target.value })
              }
              className="w-full max-w-lg rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm focus:border-ash-accent focus:outline-none focus:ring-1 focus:ring-ash-accent disabled:opacity-50"
              placeholder="e.g. Send $25 by e-transfer to organizer@example.com"
            />
            <p className="text-xs text-ash-muted">
              AshBracket does not collect payments directly. Use this field to
              tell participants how to pay, for example by e-transfer, cash, or
              another method.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-ash-text">
            <input
              type="checkbox"
              checked={value.showPotToParticipants}
              onChange={(e) =>
                onChange({
                  ...value,
                  showPotToParticipants: e.target.checked,
                })
              }
              className="mt-0.5 h-4 w-4 rounded border-ash-border text-ash-accent focus:ring-ash-accent"
            />
            <span>Show pot summary to participants</span>
          </label>

          <p className="text-xs text-ash-muted">{POOL_POT_ADMIN_HELPER}</p>
        </div>
      ) : null}

      {validationWarnings.length > 0 ? (
        <ul className="space-y-1 text-sm text-amber-200" role="status">
          {validationWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
