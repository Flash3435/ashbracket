/**
 * Self-test: `npx tsx lib/bracket/auditKnockoutTopologyStalePicks.selftest.ts`
 */
import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  auditKnockoutTopologyStalePicks,
  summarizeTopologyAuditTotals,
  teamTopologyBranchFromSlots,
} from "./auditKnockoutTopologyStalePicks";
import {
  canMeetInFinalByQfPath,
  semifinalMatchIndexForQfMatchIndex,
} from "./wc2026KnockoutPairings";

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

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: "champion|",
    sectionLabel: "C",
    slotLabel: "Champion",
    predictionKind: "champion",
    tournamentStageId: "final",
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
  "team-ger": "Germany",
};

// France (QF97) and Spain (QF98) share M101 branch.
{
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(0), 0);
  assert.strictEqual(semifinalMatchIndexForQfMatchIndex(1), 0);
  assert.strictEqual(canMeetInFinalByQfPath(0, 1), false);
  assert.strictEqual(teamTopologyBranchFromSlots("team-fra", [sfSlot("1", "team-fra")]), 0);
  assert.strictEqual(teamTopologyBranchFromSlots("team-esp", [sfSlot("2", "team-esp")]), 0);
}

// France + Spain as finalists should be stale (same M101 branch).
{
  const audit = auditKnockoutTopologyStalePicks({
    slots: [
      sfSlot("1", "team-fra"),
      sfSlot("2", "team-esp"),
      finSlot("1", "team-fra"),
      finSlot("2", "team-esp"),
    ],
    teamName: (id) => names[id] ?? id,
  });
  assert.ok(audit.stalePicks.length >= 2);
  assert.ok(
    audit.stalePicks.some(
      (s) => s.topologyIssue === "same_branch_final_pair" && s.savedTeamId === "team-esp",
    ),
    "Spain on finalist slot 2 should be stale",
  );
  assert.ok(
    audit.notes.some((n) => n.includes("France") && n.includes("Spain")),
  );
}

// France + Brazil as finalists should NOT be stale.
{
  const audit = auditKnockoutTopologyStalePicks({
    slots: [
      sfSlot("1", "team-fra"),
      sfSlot("3", "team-bra"),
      finSlot("1", "team-fra"),
      finSlot("2", "team-bra"),
      champSlot("team-fra"),
    ],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(
    audit.stalePicks.length,
    0,
    "opposite-branch finalists should not be reported stale",
  );
}

// Spain saved on finalist slot 2 (M102 path) is stale when Spain is on QF98/M101 branch.
{
  const audit = auditKnockoutTopologyStalePicks({
    slots: [
      sfSlot("2", "team-esp"),
      finSlot("2", "team-esp"),
    ],
    teamName: (id) => names[id] ?? id,
  });
  assert.ok(
    audit.stalePicks.some(
      (s) =>
        s.slot === "finalist_2" &&
        s.displayLabel === "Semifinal winner / finalist" &&
        s.roundImpact === "semifinal_winner" &&
        s.topologyIssue === "wrong_semifinal_branch" &&
        s.actualBranch === "M101" &&
        s.expectedBranch === "M102",
    ),
  );
}

// Missing champion is reported separately, not as stale.
{
  const audit = auditKnockoutTopologyStalePicks({
    slots: [
      sfSlot("1", "team-fra"),
      sfSlot("3", "team-bra"),
      finSlot("1", "team-fra"),
      finSlot("2", "team-bra"),
    ],
    teamName: (id) => names[id] ?? id,
  });
  assert.strictEqual(audit.stalePicks.length, 0);
  assert.ok(audit.missingPicks.some((m) => m.slot === "champion"));
  const totals = summarizeTopologyAuditTotals({
    poolsScanned: 1,
    participantsScanned: 1,
    participantAudits: [audit],
  });
  assert.strictEqual(totals.participantsWithStalePicks, 0);
  assert.strictEqual(totals.participantsWithOnlyMissingDownstream, 1);
}

console.log("auditKnockoutTopologyStalePicks.selftest.ts: ok");
