import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import {
  assignParticipantPickDeduped,
  THIRD_PLACE_DISABLED_OTHER_SLOT,
  THIRD_PLACE_DISABLED_RUNNER,
  THIRD_PLACE_DISABLED_WINNER,
  buildThirdPlacePickChooserOptions,
  pruneParticipantPicks,
  thirdPlacePickDisabledReason,
  thirdPlaceSlotInvalidReason,
  validateParticipantSlotsThirdPlaceRules,
} from "./knockoutPickConsistency";

function row(
  partial: Partial<KnockoutPickSlotDraft> & Pick<KnockoutPickSlotDraft, "rowKey" | "predictionKind" | "teamId">,
): KnockoutPickSlotDraft {
  return {
    sectionLabel: "",
    slotLabel: "",
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    ...partial,
  };
}

const t1 = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Alpha",
  countryCode: "AAA",
  fifaCode: null,
  fifaRank: 1,
  fifaRankAsOf: null,
  createdAt: "",
  updatedAt: "",
} as Team;
const t2 = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "Beta",
  countryCode: "BBB",
  fifaCode: null,
  fifaRank: 2,
  fifaRankAsOf: null,
  createdAt: "",
  updatedAt: "",
} as Team;
const t3 = {
  id: "30000000-0000-4000-8000-000000000003",
  name: "Gamma",
  countryCode: "CCC",
  fifaCode: null,
  fifaRank: 3,
  fifaRankAsOf: null,
  createdAt: "",
  updatedAt: "",
} as Team;

// --- thirdPlacePickDisabledReason: group winner / runner-up / other slot ---
const thirdRow = row({
  rowKey: "tp1",
  predictionKind: "third_place_qualifier",
  teamId: "",
  slotKey: "1",
});

const slotsWithWinner: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "gw",
    predictionKind: "group_winner",
    teamId: t1.id,
    groupCode: "A",
  }),
  thirdRow,
];

const r1 = thirdPlacePickDisabledReason(t1.id, thirdRow, slotsWithWinner);
if (r1 !== THIRD_PLACE_DISABLED_WINNER) {
  throw new Error(`expected winner block, got ${r1}`);
}

const slotsWithRunner: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "gr",
    predictionKind: "group_runner_up",
    teamId: t2.id,
    groupCode: "A",
  }),
  thirdRow,
];
const r2 = thirdPlacePickDisabledReason(t2.id, thirdRow, slotsWithRunner);
if (r2 !== THIRD_PLACE_DISABLED_RUNNER) {
  throw new Error(`expected runner block, got ${r2}`);
}

const tpA = row({
  rowKey: "tpA",
  predictionKind: "third_place_qualifier",
  teamId: t3.id,
  slotKey: "1",
});
const tpB = row({
  rowKey: "tpB",
  predictionKind: "third_place_qualifier",
  teamId: "",
  slotKey: "2",
});
const r3 = thirdPlacePickDisabledReason(t3.id, tpB, [tpA, tpB]);
if (r3 !== THIRD_PLACE_DISABLED_OTHER_SLOT) {
  throw new Error(`expected other third slot, got ${r3}`);
}

// Current selection stays choosable (not disabled) so user can change groups first
const tpCurrent = row({
  rowKey: "tpC",
  predictionKind: "third_place_qualifier",
  teamId: t1.id,
  slotKey: "3",
});
const r4 = thirdPlacePickDisabledReason(t1.id, tpCurrent, slotsWithWinner);
if (r4 !== null) {
  throw new Error(`expected current pick allowed in chooser, got ${r4}`);
}

// --- thirdPlaceSlotInvalidReason for saved conflict ---
const inv = thirdPlaceSlotInvalidReason(tpCurrent, slotsWithWinner);
if (inv !== THIRD_PLACE_DISABLED_WINNER) {
  throw new Error(`expected inline invalid winner, got ${inv}`);
}

// --- buildThirdPlacePickChooserOptions: winner disabled in list ---
const opts = buildThirdPlacePickChooserOptions(thirdRow, slotsWithWinner, [
  t1,
  t2,
]);
const o1 = opts.find((x) => x.team.id === t1.id);
if (!o1?.disabled || o1.disabledReason !== THIRD_PLACE_DISABLED_WINNER) {
  throw new Error("chooser should disable group winner team");
}
const o2 = opts.find((x) => x.team.id === t2.id);
if (o2?.disabled) throw new Error("t2 should be eligible");

// --- pruneParticipantPicks clears third when team is group advancer ---
const beforePrune: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "gw",
    predictionKind: "group_winner",
    teamId: t1.id,
    groupCode: "A",
  }),
  row({
    rowKey: "tp",
    predictionKind: "third_place_qualifier",
    teamId: t1.id,
    slotKey: "1",
  }),
];
const pruned = pruneParticipantPicks(beforePrune);
const tpAfter = pruned.find((s) => s.rowKey === "tp");
if (tpAfter?.teamId !== "") {
  throw new Error("prune should clear third-place pick that matches group winner");
}

// --- prune removes duplicate third-place (later row cleared) ---
const dupSlots: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "tp1",
    predictionKind: "third_place_qualifier",
    teamId: t2.id,
    slotKey: "1",
  }),
  row({
    rowKey: "tp2",
    predictionKind: "third_place_qualifier",
    teamId: t2.id,
    slotKey: "2",
  }),
];
const prunedDup = pruneParticipantPicks(dupSlots);
const first = prunedDup.find((s) => s.rowKey === "tp1")?.teamId;
const second = prunedDup.find((s) => s.rowKey === "tp2")?.teamId;
if (first !== t2.id || second !== "") {
  throw new Error(
    `duplicate third prune: expected first kept, second cleared; got ${first} / ${second}`,
  );
}

// --- validateParticipantSlotsThirdPlaceRules (save payload) ---
const payload = [
  {
    predictionKind: "group_winner",
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    slotKey: null,
    groupCode: "A",
    bonusKey: null,
    teamId: t1.id,
  },
  {
    predictionKind: "third_place_qualifier",
    tournamentStageId: "00000000-0000-4000-8000-000000000002",
    slotKey: "1",
    groupCode: null,
    bonusKey: null,
    teamId: t1.id,
  },
];
const verr = validateParticipantSlotsThirdPlaceRules(payload);
if (verr == null) {
  throw new Error("validator should reject third-place same as group winner");
}

// --- assignParticipantPickDeduped + prune clears third when group pick overlaps ---
const overlapSlots: KnockoutPickSlotDraft[] = [
  row({
    rowKey: "tp",
    predictionKind: "third_place_qualifier",
    teamId: t1.id,
    slotKey: "1",
  }),
  row({
    rowKey: "gw",
    predictionKind: "group_winner",
    teamId: "",
    groupCode: "A",
  }),
];
const afterGroupPick = assignParticipantPickDeduped(overlapSlots, "gw", t1.id);
const tpCleared = afterGroupPick.find((s) => s.rowKey === "tp")?.teamId;
if (tpCleared !== "") {
  throw new Error(
    "picking group winner same as third-place team should prune third slot",
  );
}

console.log("knockoutPickConsistency selftest: ok");
