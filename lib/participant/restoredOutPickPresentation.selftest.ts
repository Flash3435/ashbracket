/**
 * Run: npx tsx lib/participant/restoredOutPickPresentation.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildPublicParticipantPresentation,
  pickStatusPresentation,
} from "./publicParticipantPresentation";
import type { PublicParticipantDetail } from "../../types/publicParticipant";
import { buildPicksPageStatusModel } from "../picks/buildPicksPageStatus";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import { encodeKnockoutPickStatusMetadata } from "../predictions/knockoutPickStatus";
import { isKnockoutPredictionScoringEligible } from "../predictions/knockoutPickStatus";
import type { Prediction } from "../../src/types/domain";
import { buildParticipantDashboardMissingKnockoutPicks } from "../admin/adminKnockoutPickStatus";

const restoredValueText = encodeKnockoutPickStatusMetadata({
  v: 1,
  status: "out",
  reason: "restored_from_reviewed_audit",
  auditId: "audit-1",
  reviewNote: "verified in admin UI",
});

const detail: PublicParticipantDetail = {
  displayName: "Pat",
  poolName: "Pool",
  poolId: "pool-1",
  participantId: "part-1",
  totalPoints: 0,
  rank: 2,
  picks: [
    {
      predictionId: "pred-r16",
      predictionKind: "round_of_16",
      groupCode: null,
      slotKey: "2",
      bonusKey: null,
      stageCode: "round_of_16",
      stageLabel: "Round of 16",
      stageSortOrder: 40,
      teamName: "Germany",
      teamCountryCode: "GER",
      pickIsOut: true,
    },
  ],
  ledger: [],
};

const presentation = buildPublicParticipantPresentation(detail);
const pick = presentation.sections.flatMap((s) => s.picks)[0]!;
assert.equal(pick.state, "out");
assert.equal(pick.status.label, "Pick out");
assert.equal(pick.teamName, "Germany");
assert.equal(presentation.summary.emptyPicksCount, 0);
assert.equal(presentation.summary.awaitingScoreCount, 0);
assert.equal(pickStatusPresentation("out").label, "Pick out");

const qfSlot = (
  slotKey: string,
  teamId: string,
): KnockoutPickSlotDraft => ({
  rowKey: `quarterfinalist|${slotKey}`,
  sectionLabel: "Quarter-finals",
  slotLabel: `Quarter-final pick ${slotKey}`,
  predictionKind: "quarterfinalist",
  tournamentStageId: "stage-qf",
  slotKey,
  groupCode: null,
  bonusKey: null,
  teamId,
  pickStatus: "out",
  invalidReason: "restored_from_reviewed_audit",
});

const statusModel = buildPicksPageStatusModel({
  slots: [qfSlot("1", "team-ger")],
  teams: [{ id: "team-ger", name: "Germany", countryCode: "GER", fifaCode: "GER", fifaRank: 1, fifaRankAsOf: null, createdAt: "", updatedAt: "" }],
  officialRoundOf32Complete: true,
  knockoutPathRepairUnsaved: false,
  knockoutPathClearedPicks: [],
});
assert.equal(statusModel.kind, "locked_out_picks");
assert.equal(statusModel.ctaLabel, null);

const pred: Prediction = {
  id: "pred-1",
  poolId: "pool-1",
  participantId: "part-1",
  predictionKind: "round_of_16",
  teamId: "team-ger",
  tournamentStageId: "stage-r16",
  groupCode: null,
  slotKey: "2",
  bonusKey: null,
  valueText: restoredValueText,
  createdAt: "",
  updatedAt: "",
};
assert.equal(isKnockoutPredictionScoringEligible(pred), true);

const missing = buildParticipantDashboardMissingKnockoutPicks({
  slots: [
    {
      ...qfSlot("1", "team-ger"),
      predictionKind: "round_of_16",
      rowKey: "round_of_16|2",
      slotKey: "2",
      tournamentStageId: "stage-r16",
      slotLabel: "Round of 16 · pick 2",
    },
  ],
  teams: [{ id: "team-ger", name: "Germany", countryCode: "GER", fifaCode: "GER", fifaRank: 1, fifaRankAsOf: null, createdAt: "", updatedAt: "" }],
  officialRoundOf32Complete: true,
});
assert.equal(missing.actionableCount, 0);

console.log("restoredOutPickPresentation.selftest.ts: ok");
