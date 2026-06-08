/** Pool payment mode (`pools.payment_type`). */
export type PoolPaymentType = "free" | "paid";

export type PoolPaymentRow = {
  payment_type: string;
  entry_fee_label: string | null;
  entry_fee_amount: number | string | null;
  payment_instructions: string | null;
  entry_fee_cents: number | null;
  currency_code?: string | null;
  show_pot_to_participants?: boolean | null;
};

export type PoolPaymentSettings = {
  paymentType: PoolPaymentType;
  entryFeeLabel: string | null;
  entryFeeAmount: number | null;
  paymentInstructions: string | null;
  currencyCode: string;
  showPotToParticipants: boolean;
};

export const DEFAULT_ENTRY_FEE_LABEL = "Entry fee";
export const DEFAULT_CURRENCY_CODE = "CAD";

export const POOL_PAYMENT_DISCLAIMER =
  "AshBracket does not process or verify payments. Your pool organizer tracks payment manually.";

export const POOL_POT_ADMIN_HELPER =
  "The pot is calculated from participants marked as paid. AshBracket does not process or verify payments.";

export const SUPPORTED_CURRENCY_CODES = ["CAD", "USD", "EUR", "GBP"] as const;

export function isPoolPaymentType(value: string): value is PoolPaymentType {
  return value === "free" || value === "paid";
}

export function poolIsPaid(settings: Pick<PoolPaymentSettings, "paymentType">): boolean {
  return settings.paymentType === "paid";
}

function parseAmount(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeCurrencyCode(raw: string | null | undefined): string {
  const code = (raw ?? DEFAULT_CURRENCY_CODE).trim().toUpperCase();
  if (code.length === 3) return code;
  return DEFAULT_CURRENCY_CODE;
}

/** Map a `pools` row (or subset) to payment settings. */
export function mapPoolPaymentFromPool(
  pool: Partial<PoolPaymentRow> & { payment_type?: string | null },
): PoolPaymentSettings {
  return mapPoolPaymentRow({
    payment_type: pool.payment_type ?? "free",
    entry_fee_label: pool.entry_fee_label ?? null,
    entry_fee_amount: pool.entry_fee_amount ?? null,
    payment_instructions: pool.payment_instructions ?? null,
    entry_fee_cents: pool.entry_fee_cents ?? null,
    currency_code: pool.currency_code,
    show_pot_to_participants: pool.show_pot_to_participants,
  });
}

export function mapPoolPaymentRow(row: PoolPaymentRow): PoolPaymentSettings {
  const paymentType = isPoolPaymentType(row.payment_type)
    ? row.payment_type
    : "free";
  return {
    paymentType,
    entryFeeLabel: row.entry_fee_label?.trim() || null,
    entryFeeAmount: parseAmount(row.entry_fee_amount),
    paymentInstructions: row.payment_instructions?.trim() || null,
    currencyCode: normalizeCurrencyCode(row.currency_code),
    showPotToParticipants: Boolean(row.show_pot_to_participants),
  };
}

export function entryFeeCentsFromAmount(amount: number | null): number | null {
  if (amount == null) return null;
  return Math.round(amount * 100);
}

export type PoolPaymentInput = {
  paymentType: PoolPaymentType;
  entryFeeLabel: string;
  entryFeeAmount: string;
  paymentInstructions: string;
  currencyCode: string;
  showPotToParticipants: boolean;
};

export type PoolPaymentValidation =
  | { ok: true; settings: PoolPaymentSettings; warnings: string[] }
  | { ok: false; error: string };

export function validatePoolPaymentInput(
  input: PoolPaymentInput,
): PoolPaymentValidation {
  const paymentType = input.paymentType;
  if (!isPoolPaymentType(paymentType)) {
    return { ok: false, error: "Choose whether this pool is free or paid." };
  }

  if (paymentType === "free") {
    return {
      ok: true,
      settings: {
        paymentType: "free",
        entryFeeLabel: null,
        entryFeeAmount: null,
        paymentInstructions: null,
        currencyCode: DEFAULT_CURRENCY_CODE,
        showPotToParticipants: false,
      },
      warnings: [],
    };
  }

  const label = input.entryFeeLabel.trim() || DEFAULT_ENTRY_FEE_LABEL;
  const amountRaw = input.entryFeeAmount.trim();
  let entryFeeAmount: number | null = null;
  if (amountRaw !== "") {
    const parsed = Number(amountRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        ok: false,
        error: "Entry fee amount must be a non-negative number.",
      };
    }
    entryFeeAmount = parsed;
  }

  const currencyCode = normalizeCurrencyCode(input.currencyCode);
  const paymentInstructions = input.paymentInstructions.trim() || null;
  const warnings: string[] = [];
  if (!paymentInstructions) {
    warnings.push(
      "Consider adding payment instructions so participants know how to pay.",
    );
  }

  return {
    ok: true,
    settings: {
      paymentType: "paid",
      entryFeeLabel: label,
      entryFeeAmount,
      paymentInstructions,
      currencyCode,
      showPotToParticipants: Boolean(input.showPotToParticipants),
    },
    warnings,
  };
}

/** DB columns for `pools` update from validated settings. */
export function poolPaymentToDbColumns(settings: PoolPaymentSettings): {
  payment_type: PoolPaymentType;
  entry_fee_label: string | null;
  entry_fee_amount: number | null;
  payment_instructions: string | null;
  entry_fee_cents: number | null;
  currency_code: string;
  show_pot_to_participants: boolean;
} {
  if (settings.paymentType === "free") {
    return {
      payment_type: "free",
      entry_fee_label: null,
      entry_fee_amount: null,
      payment_instructions: null,
      entry_fee_cents: null,
      currency_code: DEFAULT_CURRENCY_CODE,
      show_pot_to_participants: false,
    };
  }
  return {
    payment_type: "paid",
    entry_fee_label: settings.entryFeeLabel ?? DEFAULT_ENTRY_FEE_LABEL,
    entry_fee_amount: settings.entryFeeAmount,
    payment_instructions: settings.paymentInstructions,
    entry_fee_cents: entryFeeCentsFromAmount(settings.entryFeeAmount),
    currency_code: settings.currencyCode,
    show_pot_to_participants: settings.showPotToParticipants,
  };
}

export function formatMoneyAmount(
  amount: number | null,
  currencyCode: string,
): string | null {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatPoolEntryFeeAmount(
  amount: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
): string | null {
  return formatMoneyAmount(amount, currencyCode);
}

export function formatParticipantEntryFee(
  settings: PoolPaymentSettings,
): string | null {
  if (!poolIsPaid(settings)) return null;
  const amountLabel = formatPoolEntryFeeAmount(
    settings.entryFeeAmount,
    settings.currencyCode,
  );
  const label = settings.entryFeeLabel?.trim() || DEFAULT_ENTRY_FEE_LABEL;
  if (amountLabel) return `${label}: ${amountLabel}`;
  return label;
}
