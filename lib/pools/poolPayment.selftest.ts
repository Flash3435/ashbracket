import {
  entryFeeCentsFromAmount,
  poolPaymentToDbColumns,
  validatePoolPaymentInput,
} from "./poolPayment";

const free = validatePoolPaymentInput({
  paymentType: "free",
  entryFeeLabel: "",
  entryFeeAmount: "",
  paymentInstructions: "",
  currencyCode: "CAD",
  showPotToParticipants: true,
});
console.assert(free.ok && free.settings.paymentType === "free", "free pool");
console.assert(
  free.ok && !free.settings.showPotToParticipants,
  "free clears show pot",
);

const paidNoInstructions = validatePoolPaymentInput({
  paymentType: "paid",
  entryFeeLabel: "Entry fee",
  entryFeeAmount: "25",
  paymentInstructions: "",
  currencyCode: "USD",
  showPotToParticipants: true,
});
console.assert(
  paidNoInstructions.ok && paidNoInstructions.warnings.length === 1,
  "paid warns without instructions",
);

const paidDb = poolPaymentToDbColumns({
  paymentType: "paid",
  entryFeeLabel: "Buy-in",
  entryFeeAmount: 25,
  paymentInstructions: "E-transfer",
  currencyCode: "USD",
  showPotToParticipants: true,
});
console.assert(
  paidDb.entry_fee_cents === 2500 &&
    paidDb.payment_type === "paid" &&
    paidDb.currency_code === "USD" &&
    paidDb.show_pot_to_participants === true,
  "sync paid db columns",
);

console.assert(entryFeeCentsFromAmount(10.5) === 1050, "cents rounding");

console.log("poolPayment.selftest.ts: ok");
