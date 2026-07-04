/**
 * Self-test: `npx tsx lib/bracket/auditKnockoutSemifinalPicks.selftest.ts`
 */
import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  auditKnockoutSemifinalPicks,
  isStaleSemifinalPickStatus,
  summarizeSemifinalAuditTotals,
} from "./auditKnockoutSemifinalPicks";

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "SF",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
    tournamentStageId: "sf",
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
    tournamentStageId: "final",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const names: Record<string, string> = {
  "team-fra": "France",
  "team-esp": "Spain",
  "team-bra": "Brazil",
  "team-ned": "Netherlands",
};

function pick(
  audit: ReturnType<typeof auditKnockoutSemifinalPicks>,
  slot: "semifinal_101" | "semifinal_102",
) {
  return audit.semifinalPicks.find((p) => p.slot === slot)!;
}

// France (QF97/M101 branch) saved as M101 winner is valid.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("1", "team-fra"), finSlot("1", "team-fra")],
    teamName: (id) => names[id] ?? id,
  });
  const m101 = pick(audit, "semifinal_101");
  assert.strictEqual(m101.status, "valid");
  assert.strictEqual(m101.expectedBranch, "M101");
  assert.strictEqual(m101.actualBranch, "M101");
}

// France saved as M102 winner is stale_wrong_branch.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("1", "team-fra"), finSlot("2", "team-fra")],
    teamName: (id) => names[id] ?? id,
  });
  const m102 = pick(audit, "semifinal_102");
  assert.strictEqual(m102.status, "stale_wrong_branch");
  assert.strictEqual(m102.expectedBranch, "M102");
  assert.strictEqual(m102.actualBranch, "M101");
  assert.ok(m102.reason.includes("M101 branch"));
}

// Spain (QF98/M101 branch) saved as M101 winner is valid.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("2", "team-esp"), finSlot("1", "team-esp")],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(pick(audit, "semifinal_101").status, "valid");
}

// Spain saved as M102 winner is stale_wrong_branch.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("2", "team-esp"), finSlot("2", "team-esp")],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(pick(audit, "semifinal_102").status, "stale_wrong_branch");
}

// Brazil (QF99/M102 branch) saved as M102 winner is valid.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("3", "team-bra"), finSlot("2", "team-bra")],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(pick(audit, "semifinal_102").status, "valid");
  assert.strictEqual(pick(audit, "semifinal_102").actualBranch, "M102");
}

// Brazil saved as M101 winner is stale_wrong_branch.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("3", "team-bra"), finSlot("1", "team-bra")],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(pick(audit, "semifinal_101").status, "stale_wrong_branch");
  assert.strictEqual(pick(audit, "semifinal_101").actualBranch, "M102");
}

// Missing semifinal pick is counted as missing, not stale.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [sfSlot("1", "team-fra"), finSlot("1"), finSlot("2")],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(pick(audit, "semifinal_101").status, "missing");
  assert.strictEqual(pick(audit, "semifinal_102").status, "missing");
  assert.ok(!isStaleSemifinalPickStatus(pick(audit, "semifinal_101").status));
  const totals = summarizeSemifinalAuditTotals({
    poolsScanned: 1,
    participantsScanned: 1,
    participantAudits: [audit],
  });
  assert.strictEqual(totals.missingSemifinalPicks, 2);
  assert.strictEqual(totals.staleSemifinalPicks, 0);
  assert.strictEqual(totals.participantsWithMissingSemifinalPicks, 1);
}

// Upstream incomplete semifinal path is not falsely counted as stale.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [finSlot("1", "team-fra")],
    teamName: (id) => names[id] ?? id,
  });
  const m101 = pick(audit, "semifinal_101");
  assert.strictEqual(m101.status, "upstream_incomplete");
  assert.strictEqual(m101.savedTeamId, "team-fra");
  assert.ok(!isStaleSemifinalPickStatus(m101.status));
  const totals = summarizeSemifinalAuditTotals({
    poolsScanned: 1,
    participantsScanned: 1,
    participantAudits: [audit],
  });
  assert.strictEqual(totals.staleSemifinalPicks, 0);
}

// Locked stale semifinal pick is counted separately.
{
  const audit = auditKnockoutSemifinalPicks({
    slots: [
      sfSlot("1", "team-fra"),
      {
        ...finSlot("2", "team-fra"),
        pickStatus: "out",
      },
    ],
    teamName: (id) => names[id] ?? id,
  });
  const m102 = pick(audit, "semifinal_102");
  assert.strictEqual(m102.status, "stale_wrong_branch");
  assert.strictEqual(m102.locked, true);
  const totals = summarizeSemifinalAuditTotals({
    poolsScanned: 1,
    participantsScanned: 1,
    participantAudits: [audit],
  });
  assert.strictEqual(totals.staleM102Picks, 1);
  assert.strictEqual(totals.lockedStaleSemifinalPicks, 1);
}

console.log("auditKnockoutSemifinalPicks.selftest.ts: ok");
