/**
 * Self-test: `npx tsx lib/bracket/planKnockoutTopologyStalePickRepairs.selftest.ts`
 */
import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  auditKnockoutTopologyStalePicks,
  type TopologyStalePickFinding,
} from "./auditKnockoutTopologyStalePicks";
import {
  assertRepairPlanCanApply,
  dedupeStaleFindingsForRepair,
  planClearsFromStaleFindings,
  repairPlanFingerprint,
  summarizeRepairActions,
} from "./planKnockoutTopologyStalePickRepairs";

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "SF",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
    tournamentStageId: "sf-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "F",
    slotLabel: slotKey,
    predictionKind: "finalist",
    tournamentStageId: "final-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: "champion|",
    sectionLabel: "C",
    slotLabel: "Champion",
    predictionKind: "champion",
    tournamentStageId: "final-stage",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const names: Record<string, string> = {
  "team-fra": "France",
  "team-esp": "Spain",
  "team-bra": "Brazil",
};

function auditSlots(slots: KnockoutPickSlotDraft[]) {
  return auditKnockoutTopologyStalePicks({
    slots,
    teamName: (id) => names[id] ?? id,
  });
}

function planFor(slots: KnockoutPickSlotDraft[]) {
  const audit = auditSlots(slots);
  return planClearsFromStaleFindings({
    poolId: "pool-1",
    poolName: "Test Pool",
    participantId: "participant-1",
    participantName: "Test User",
    participantEmail: "test@example.com",
    slots,
    staleFindings: dedupeStaleFindingsForRepair(audit.stalePicks),
  });
}

// France + Spain finalists produce planned clears.
{
  const slots = [
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-esp"),
    champSlot("team-esp"),
  ];
  const actions = planFor(slots);
  assert.ok(actions.length >= 3);
  assert.ok(actions.some((a) => a.predictionKind === "finalist" && a.slotKey === "2"));
  assert.ok(actions.some((a) => a.predictionKind === "champion"));
  assert.strictEqual(assertRepairPlanCanApply(actions).ok, true);
}

// France + Brazil finalists produce no planned clears.
{
  const slots = [
    sfSlot("1", "team-fra"),
    sfSlot("3", "team-bra"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-bra"),
    champSlot("team-fra"),
  ];
  const actions = planFor(slots);
  assert.strictEqual(actions.length, 0);
}

// Missing champion is reported by audit but not cleared as stale.
{
  const slots = [
    sfSlot("1", "team-fra"),
    sfSlot("3", "team-bra"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-bra"),
  ];
  const audit = auditSlots(slots);
  assert.ok(audit.missingPicks.some((m) => m.slot === "champion"));
  assert.strictEqual(planFor(slots).length, 0);
}

// Locked stale row blocks apply.
{
  const lockedFinding: TopologyStalePickFinding = {
    slot: "finalist_2",
    predictionKind: "finalist",
    slotKey: "2",
    slotType: "finalist",
    displayLabel: "Semifinal winner / finalist",
    roundImpact: "semifinal_winner",
    savedTeamId: "team-esp",
    savedTeamName: "Spain",
    actualBranch: "M101",
    expectedBranch: "M102",
    reason: "locked stale",
    rowState: "locked_out",
    pruneReason: null,
    topologyIssue: "wrong_semifinal_branch",
  };
  const actions = planClearsFromStaleFindings({
    poolId: "pool-1",
    poolName: "Test Pool",
    participantId: "participant-1",
    participantName: "Test User",
    participantEmail: null,
    slots: [finSlot("2", "team-esp")],
    staleFindings: [lockedFinding],
  });
  const gate = assertRepairPlanCanApply(actions);
  assert.strictEqual(gate.ok, false);
  if (!gate.ok) {
    assert.match(gate.reason, /locked out/i);
  }
}

// Fingerprint is stable for identical plans.
{
  const slots = [
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-esp"),
  ];
  const a = planFor(slots);
  const b = planFor(slots);
  assert.strictEqual(repairPlanFingerprint(a), repairPlanFingerprint(b));
  const summary = summarizeRepairActions(a);
  assert.ok(summary.finalistClears >= 2);
}

console.log("planKnockoutTopologyStalePickRepairs.selftest.ts: ok");
