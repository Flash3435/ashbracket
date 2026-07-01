import assert from "node:assert";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildBackfillReviewReportPayload,
  buildKnockoutOutPickBackfillPlan,
  buildMediumCandidateReviewReports,
  buildRestoredOutValueText,
  buildReviewedMediumBackfillPlan,
  buildReviewedRestoredOutValueText,
  extractBackfillCandidatesFromAuditRows,
  getApplyableBackfillUpserts,
  getReviewedApplyableUpserts,
  inferKindAndSlotFromClearedLabel,
  isNonKnockoutBracketPrediction,
  mediumReviewReportsToCsv,
  parseBackfillReviewDecisionFile,
  tournamentStageIdForKnockoutPick,
  validateBackfillReviewDecisions,
  planSingleReviewedBackfillRestore,
  summarizeKnockoutOutBackfillReview,
  formatBackfillCurrentDbStateLabel,
} from "./knockoutOutPickBackfillPlanner";
import { decodeKnockoutPickStatusMetadata } from "../predictions/knockoutPickStatus";

const stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>> = {
  quarterfinal: {
    id: "stage-qf",
    code: "quarterfinal",
    label: "Quarter-finals",
    sortOrder: 4,
    startsAt: null,
    endsAt: null,
    createdAt: "",
    updatedAt: "",
  },
  round_of_16: {
    id: "stage-r16",
    code: "round_of_16",
    label: "Round of 16",
    sortOrder: 3,
    startsAt: null,
    endsAt: null,
    createdAt: "",
    updatedAt: "",
  },
};

const teams = [
  { id: "team-bra", name: "Brazil", countryCode: "BRA" },
  { id: "team-arg", name: "Argentina", countryCode: "ARG" },
];

function pred(partial: Partial<Prediction> & Pick<Prediction, "participantId" | "poolId" | "predictionKind">): Prediction {
  return {
    id: partial.id ?? "pred-1",
    participantId: partial.participantId,
    poolId: partial.poolId,
    predictionKind: partial.predictionKind,
    tournamentStageId: partial.tournamentStageId ?? "stage-qf",
    groupCode: partial.groupCode ?? null,
    slotKey: partial.slotKey ?? "1",
    bonusKey: partial.bonusKey ?? null,
    teamId: partial.teamId ?? null,
    valueText: partial.valueText ?? null,
    createdAt: "",
    updatedAt: "",
  };
}

const auditHigh = {
  id: "audit-1",
  poolId: "pool-1",
  participantId: "part-1",
  matchCode: "M89",
  createdAt: "2026-06-28T12:00:00Z",
  actorEmail: "admin@example.com",
  metadata: {
    clearedPickCount: 1,
    clearedSummary: ["Quarter-finals · pick 1 (Brazil) — not_in_official_matchup"],
    markedOutPicks: [
      {
        predictionKind: "quarterfinalist",
        slotKey: "1",
        teamId: "team-bra",
        reason: "not_in_official_matchup",
      },
    ],
  },
};

const candidates = extractBackfillCandidatesFromAuditRows({
  auditRows: [auditHigh],
  stageByCode,
  teams,
});

assert.strictEqual(candidates.length, 1);
assert.strictEqual(candidates[0]!.confidence, "high");
assert.strictEqual(candidates[0]!.teamId, "team-bra");
assert.ok(candidates[0]!.candidateId.includes("audit-1"));

const restorePlan = buildKnockoutOutPickBackfillPlan({
  candidates,
  existingPredictions: [],
});
assert.strictEqual(restorePlan.items.length, 1);
assert.strictEqual(restorePlan.items[0]!.action, "restore");

const conflictPlan = buildKnockoutOutPickBackfillPlan({
  candidates,
  existingPredictions: [
    pred({
      participantId: "part-1",
      poolId: "pool-1",
      predictionKind: "quarterfinalist",
      tournamentStageId: "stage-qf",
      slotKey: "1",
      teamId: "team-arg",
    }),
  ],
});
assert.strictEqual(conflictPlan.items[0]!.action, "skip");
assert.strictEqual(
  conflictPlan.items[0]!.action === "skip"
    ? conflictPlan.items[0]!.reason
    : null,
  "active_conflict",
);

const missingTeamPlan = buildKnockoutOutPickBackfillPlan({
  candidates: [{ ...candidates[0]!, teamId: "  " }],
  existingPredictions: [],
});
assert.strictEqual(missingTeamPlan.items[0]!.action, "skip");
assert.strictEqual(
  missingTeamPlan.items[0]!.action === "skip"
    ? missingTeamPlan.items[0]!.reason
    : null,
  "missing_team_id",
);

assert.strictEqual(
  isNonKnockoutBracketPrediction(
    pred({
      participantId: "part-1",
      poolId: "pool-1",
      predictionKind: "bonus_pick",
      bonusKey: "golden_boot",
      valueText: "Some player name",
    }),
  ),
  true,
);

const bonusIgnoredPlan = buildKnockoutOutPickBackfillPlan({
  candidates,
  existingPredictions: [
    pred({
      participantId: "part-1",
      poolId: "pool-1",
      predictionKind: "bonus_pick",
      bonusKey: "golden_boot",
      tournamentStageId: "stage-qf",
      slotKey: "1",
      teamId: "team-bra",
      valueText: "Bonus text",
    }),
  ],
});
assert.strictEqual(bonusIgnoredPlan.items[0]!.action, "restore");

assert.deepStrictEqual(getApplyableBackfillUpserts(restorePlan, false), []);
assert.strictEqual(getApplyableBackfillUpserts(restorePlan, true).length, 1);

const valueText = buildRestoredOutValueText("2026-06-30T00:00:00.000Z");
const decoded = decodeKnockoutPickStatusMetadata(valueText);
assert.strictEqual(decoded?.status, "out");
assert.strictEqual(decoded?.reason, "restored_from_audit");
assert.strictEqual(decoded?.invalidatedAt, "2026-06-30T00:00:00.000Z");

const restoreItem = restorePlan.items[0];
assert.ok(restoreItem && (restoreItem.action === "restore" || restoreItem.action === "add_status_only"));
if (restoreItem.action === "restore" || restoreItem.action === "add_status_only") {
  assert.match(restoreItem.upsert.value_text, /^ab_pick_status:/);
}

const mediumAudit = extractBackfillCandidatesFromAuditRows({
  auditRows: [
    {
      id: "audit-2",
      poolId: "pool-1",
      participantId: "part-2",
      matchCode: "M90",
      createdAt: "2026-06-28T12:00:00Z",
      actorEmail: "reviewer@example.com",
      metadata: {
        clearedSummary: ["Round of 16 · pick 2 (Argentina) — upstream_incomplete"],
      },
    },
  ],
  stageByCode,
  teams,
});
assert.strictEqual(mediumAudit.length, 1);
assert.strictEqual(mediumAudit[0]!.confidence, "medium");
const mediumPlan = buildKnockoutOutPickBackfillPlan({
  candidates: mediumAudit,
  existingPredictions: [],
});
assert.strictEqual(mediumPlan.items[0]!.action, "report_only");

const mediumReports = buildMediumCandidateReviewReports({
  candidates: mediumAudit,
  existingPredictions: [],
  participantNameById: new Map([["part-2", "Pat"]]),
  poolNameById: new Map([["pool-1", "Test Pool"]]),
  auditById: new Map([
    [
      "audit-2",
      {
        id: "audit-2",
        poolId: "pool-1",
        participantId: "part-2",
        matchCode: "M90",
        createdAt: "2026-06-28T12:00:00Z",
        actorEmail: "reviewer@example.com",
        metadata: mediumAudit[0]!.clearedSummaryLine
          ? { clearedSummary: [mediumAudit[0]!.clearedSummaryLine] }
          : null,
      },
    ],
  ]),
});
assert.strictEqual(mediumReports.length, 1);
assert.strictEqual(mediumReports[0]!.participantName, "Pat");
assert.strictEqual(mediumReports[0]!.poolName, "Test Pool");
assert.strictEqual(mediumReports[0]!.auditActor, "reviewer@example.com");
assert.strictEqual(mediumReports[0]!.suggestedAction, "manual_review");

const csv = mediumReviewReportsToCsv(mediumReports);
assert.match(csv, /^candidateId,participantName,poolName,/);
assert.match(csv, /Pat/);
assert.match(csv, /manual_review/);

const reviewPayload = buildBackfillReviewReportPayload({ mediumReports });
assert.strictEqual(reviewPayload.mediumCandidates.length, 1);
assert.strictEqual(reviewPayload.decisionTemplate[0]!.candidateId, mediumReports[0]!.candidateId);

const mediumCandidateId = mediumAudit[0]!.candidateId;
const knownIds = new Set([mediumCandidateId]);

const unreviewedPlan = buildReviewedMediumBackfillPlan({
  candidates: mediumAudit,
  decisions: [],
  existingPredictions: [],
});
assert.strictEqual(getReviewedApplyableUpserts(unreviewedPlan).length, 0);
assert.ok(
  unreviewedPlan.items.some(
    (item) => item.action === "report_only" && item.reason === "not_reviewed",
  ),
);

const reviewedPlan = buildReviewedMediumBackfillPlan({
  candidates: mediumAudit,
  decisions: [
    {
      candidateId: mediumCandidateId,
      decision: "restore_as_out",
      note: "verified against screenshot",
    },
  ],
  existingPredictions: [],
});
assert.strictEqual(getReviewedApplyableUpserts(reviewedPlan).length, 1);
const reviewedUpsert = getReviewedApplyableUpserts(reviewedPlan)[0]!;
const reviewedDecoded = decodeKnockoutPickStatusMetadata(reviewedUpsert.value_text);
assert.strictEqual(reviewedDecoded?.reason, "restored_from_reviewed_audit");
assert.strictEqual(reviewedDecoded?.auditId, "audit-2");
assert.strictEqual(reviewedDecoded?.reviewNote, "verified against screenshot");

const skippedPlan = buildReviewedMediumBackfillPlan({
  candidates: mediumAudit,
  decisions: [{ candidateId: mediumCandidateId, decision: "skip", note: "leave empty" }],
  existingPredictions: [],
});
assert.strictEqual(getReviewedApplyableUpserts(skippedPlan).length, 0);
assert.ok(
  skippedPlan.items.some(
    (item) => item.action === "skip" && item.reason === "review_skipped",
  ),
);

const approvedConflictPlan = buildReviewedMediumBackfillPlan({
  candidates: mediumAudit,
  decisions: [{ candidateId: mediumCandidateId, decision: "restore_as_out" }],
  existingPredictions: [
    pred({
      participantId: "part-2",
      poolId: "pool-1",
      predictionKind: "round_of_16",
      tournamentStageId: "stage-r16",
      slotKey: "2",
      teamId: "team-bra",
    }),
  ],
});
assert.strictEqual(getReviewedApplyableUpserts(approvedConflictPlan).length, 0);
assert.ok(
  approvedConflictPlan.items.some(
    (item) => item.action === "skip" && item.reason === "active_conflict",
  ),
);

const mismatch = validateBackfillReviewDecisions({
  decisions: [{ candidateId: "unknown-id", decision: "restore_as_out" }],
  knownCandidateIds: knownIds,
});
assert.strictEqual(mismatch.ok, false);
if (!mismatch.ok) {
  assert.match(mismatch.errors.join(" "), /Unknown candidateId/);
}

assert.throws(
  () =>
    parseBackfillReviewDecisionFile({
      decisions: [{ candidateId: mediumCandidateId, decision: "approve" }],
    }),
  /Invalid decision/,
);

assert.deepStrictEqual(
  inferKindAndSlotFromClearedLabel("Quarter-finals · pick 1"),
  { kind: "quarterfinalist", slotKey: "1" },
);
assert.strictEqual(
  tournamentStageIdForKnockoutPick("quarterfinalist", stageByCode),
  "stage-qf",
);

const reviewedValueText = buildReviewedRestoredOutValueText({
  auditId: "audit-2",
  reviewNote: "checked",
  restoredAt: "2026-06-30T01:00:00.000Z",
});
assert.match(reviewedValueText, /restored_from_reviewed_audit/);
assert.match(reviewedValueText, /audit-2/);

const singleRestore = planSingleReviewedBackfillRestore({
  candidates: mediumAudit,
  candidateId: mediumCandidateId,
  note: "admin UI verified",
  existingPredictions: [],
});
assert.strictEqual(singleRestore.ok, true);
if (singleRestore.ok) {
  assert.strictEqual(singleRestore.applyAction, "restore");
  const meta = decodeKnockoutPickStatusMetadata(singleRestore.upsert.value_text);
  assert.strictEqual(meta?.reason, "restored_from_reviewed_audit");
  assert.strictEqual(meta?.reviewNote, "admin UI verified");
}

const staleRestore = planSingleReviewedBackfillRestore({
  candidates: mediumAudit,
  candidateId: "stale-id",
  existingPredictions: [],
});
assert.strictEqual(staleRestore.ok, false);

const summary = summarizeKnockoutOutBackfillReview({
  candidates: mediumAudit,
  mediumReports,
  manualAuditGaps: ["gap one"],
});
assert.strictEqual(summary.mediumCandidates, 1);
assert.strictEqual(summary.auditGaps, 1);
assert.strictEqual(summary.restorableMedium, 1);

assert.match(
  formatBackfillCurrentDbStateLabel("conflict_active:Germany(team-bra)"),
  /Conflict/,
);

console.log("knockoutOutPickBackfillPlanner.selftest.ts: ok");
