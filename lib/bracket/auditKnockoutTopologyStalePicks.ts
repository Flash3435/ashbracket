import {
  qfMatchIndexForQuarterfinalistSlot,
  semifinalMatchIndexForQfMatchIndex,
} from "./wc2026KnockoutPairings";
import type {
  ClearedKnockoutPathPick,
  KnockoutPathPickClearReason,
} from "../predictions/pruneOfficialKnockoutPathPicks";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

/** Semi-final branch under corrected FIFA topology (0 = M101, 1 = M102). */
export type TopologyBranchIndex = 0 | 1;

export type TopologyAuditSlot =
  | "semifinalist_1"
  | "semifinalist_2"
  | "semifinalist_3"
  | "semifinalist_4"
  | "finalist_1"
  | "finalist_2"
  | "champion";

export type TopologyPickRowState = "editable" | "locked_out" | "frozen";

export type TopologyStalePickFinding = {
  slot: TopologyAuditSlot;
  predictionKind: "semifinalist" | "finalist" | "champion";
  slotKey: string | null;
  savedTeamId: string;
  savedTeamName: string;
  actualBranch: string;
  expectedBranch: string;
  reason: string;
  rowState: TopologyPickRowState;
  pruneReason: KnockoutPathPickClearReason | null;
  topologyIssue:
    | "wrong_semifinal_branch"
    | "same_branch_final_pair"
    | "champion_not_in_valid_final"
    | "champion_on_stale_finalist_path";
};

export type TopologyMissingPickFinding = {
  slot: TopologyAuditSlot;
  predictionKind: "semifinalist" | "finalist" | "champion";
  slotKey: string | null;
  reason: string;
};

export type TopologyParticipantAudit = {
  stalePicks: TopologyStalePickFinding[];
  missingPicks: TopologyMissingPickFinding[];
  notes: string[];
};

export const CORRECTED_TOPOLOGY = {
  M101: ["M97", "M98"],
  M102: ["M99", "M100"],
} as const;

const SF_PLUS_KINDS = ["semifinalist", "finalist", "champion"] as const;

export function branchLabel(branch: TopologyBranchIndex | null): string {
  if (branch === 0) return "M101";
  if (branch === 1) return "M102";
  return "unknown";
}

function topologyBranchFromQfIndex(qfIndex: number): TopologyBranchIndex | null {
  const branch = semifinalMatchIndexForQfMatchIndex(qfIndex);
  return branch === 0 || branch === 1 ? branch : null;
}

export function expectedBranchForFinalistSlot(
  slotKey: string,
): TopologyBranchIndex {
  return slotKey === "1" ? 0 : 1;
}

export function auditSlotLabel(
  kind: "semifinalist" | "finalist" | "champion",
  slotKey: string | null,
): TopologyAuditSlot {
  if (kind === "champion") return "champion";
  if (kind === "finalist") {
    return slotKey === "2" ? "finalist_2" : "finalist_1";
  }
  const n = slotKey ?? "1";
  return `semifinalist_${n}` as TopologyAuditSlot;
}

function slotRow(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutPickSlotDraft["predictionKind"],
  slotKey: string | null,
): KnockoutPickSlotDraft | undefined {
  return slots.find(
    (s) => s.predictionKind === kind && s.slotKey === slotKey,
  );
}

function rowState(row: KnockoutPickSlotDraft | undefined): TopologyPickRowState {
  if (!row?.teamId.trim()) return "editable";
  if (isKnockoutPickLockedOut(row)) return "locked_out";
  return "editable";
}

/** Infer which semi-final branch a team belongs to from saved QF-path picks. */
export function teamTopologyBranchFromSlots(
  teamId: string,
  slots: KnockoutPickSlotDraft[],
): TopologyBranchIndex | null {
  const id = teamId.trim();
  if (!id) return null;

  for (let qfSlot = 1; qfSlot <= 4; qfSlot += 1) {
    const row = slotRow(slots, "semifinalist", String(qfSlot));
    if (row?.teamId.trim() === id) {
      const branch = topologyBranchFromQfIndex(qfSlot - 1);
      if (branch != null) return branch;
    }
  }

  for (let r16Slot = 1; r16Slot <= 8; r16Slot += 1) {
    const row = slotRow(slots, "quarterfinalist", String(r16Slot));
    if (row?.teamId.trim() !== id) continue;
    const qfIndex = qfMatchIndexForQuarterfinalistSlot(String(r16Slot));
    if (qfIndex == null) continue;
    const branch = topologyBranchFromQfIndex(qfIndex);
    if (branch != null) return branch;
  }

  return null;
}

function teamNameOrId(
  teamId: string,
  resolve?: (teamId: string) => string,
): string {
  return resolve?.(teamId) ?? teamId;
}

function wrongBranchReason(input: {
  slotLabel: string;
  teamName: string;
  actualBranch: string;
  expectedBranch: string;
}): string {
  return `Saved team ${input.teamName} belongs to the ${input.actualBranch} branch but was saved in the ${input.expectedBranch}/${input.slotLabel} path under corrected FIFA topology.`;
}

function hasAnySfPlusSavedPick(slots: KnockoutPickSlotDraft[]): boolean {
  return slots.some(
    (s) =>
      (s.predictionKind === "semifinalist" ||
        s.predictionKind === "finalist" ||
        s.predictionKind === "champion") &&
      s.teamId.trim(),
  );
}

function isSfPlusKind(
  kind: string,
): kind is (typeof SF_PLUS_KINDS)[number] {
  return (SF_PLUS_KINDS as readonly string[]).includes(kind);
}

/**
 * Read-only audit for semi-final and above picks that are impossible under the
 * corrected M101/M102 feeder topology. Does not mutate slots.
 */
export function auditKnockoutTopologyStalePicks(input: {
  slots: KnockoutPickSlotDraft[];
  teamName?: (teamId: string) => string;
  pathRepairCleared?: readonly ClearedKnockoutPathPick[];
}): TopologyParticipantAudit {
  const { slots, teamName, pathRepairCleared = [] } = input;
  const stalePicks: TopologyStalePickFinding[] = [];
  const missingPicks: TopologyMissingPickFinding[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();

  function pushStale(finding: TopologyStalePickFinding): void {
    const key = `${finding.predictionKind}|${finding.slotKey ?? ""}|${finding.savedTeamId}|${finding.topologyIssue}`;
    if (seen.has(key)) return;
    seen.add(key);
    stalePicks.push(finding);
  }

  const fin1 = slotRow(slots, "finalist", "1");
  const fin2 = slotRow(slots, "finalist", "2");
  const champ = slotRow(slots, "champion", null);

  for (const slotKey of ["1", "2"] as const) {
    const row = slotRow(slots, "finalist", slotKey);
    const teamId = row?.teamId.trim();
    if (!teamId) continue;

    const expectedBranch = expectedBranchForFinalistSlot(slotKey);
    const actualBranch = teamTopologyBranchFromSlots(teamId, slots);
    if (actualBranch == null) continue;

    if (actualBranch !== expectedBranch) {
      pushStale({
        slot: auditSlotLabel("finalist", slotKey),
        predictionKind: "finalist",
        slotKey,
        savedTeamId: teamId,
        savedTeamName: teamNameOrId(teamId, teamName),
        actualBranch: branchLabel(actualBranch),
        expectedBranch: branchLabel(expectedBranch),
        reason: wrongBranchReason({
          slotLabel: slotKey === "1" ? "finalist-1" : "finalist-2",
          teamName: teamNameOrId(teamId, teamName),
          actualBranch: branchLabel(actualBranch),
          expectedBranch: branchLabel(expectedBranch),
        }),
        rowState: rowState(row),
        pruneReason: null,
        topologyIssue: "wrong_semifinal_branch",
      });
    }
  }

  const fin1Branch = fin1?.teamId.trim()
    ? teamTopologyBranchFromSlots(fin1.teamId.trim(), slots)
    : null;
  const fin2Branch = fin2?.teamId.trim()
    ? teamTopologyBranchFromSlots(fin2.teamId.trim(), slots)
    : null;

  if (
    fin1?.teamId.trim() &&
    fin2?.teamId.trim() &&
    fin1Branch != null &&
    fin2Branch != null &&
    fin1Branch === fin2Branch
  ) {
    notes.push(
      `Both saved finalists (${teamNameOrId(fin1.teamId, teamName)} and ${teamNameOrId(fin2.teamId, teamName)}) are on the ${branchLabel(fin1Branch)} branch and cannot meet in the Final under corrected topology.`,
    );
    for (const [row, slotKey] of [
      [fin1, "1"],
      [fin2, "2"],
    ] as const) {
      const teamId = row?.teamId.trim();
      if (!teamId || fin1Branch == null) continue;
      pushStale({
        slot: auditSlotLabel("finalist", slotKey),
        predictionKind: "finalist",
        slotKey,
        savedTeamId: teamId,
        savedTeamName: teamNameOrId(teamId, teamName),
        actualBranch: branchLabel(fin1Branch),
        expectedBranch:
          slotKey === "1" ? branchLabel(0) : branchLabel(1),
        reason:
          slotKey === "1"
            ? `Both finalists are on the ${branchLabel(fin1Branch)} branch; only one can reach the Final from that semi-final.`
            : `Both finalists are on the ${branchLabel(fin1Branch)} branch; finalist slot 2 requires an ${branchLabel(1)} branch team under corrected topology.`,
        rowState: rowState(row),
        pruneReason: null,
        topologyIssue: "same_branch_final_pair",
      });
    }
  }

  const champId = champ?.teamId.trim();
  if (champId) {
    const validFinalTeamIds = new Set(
      [fin1?.teamId.trim(), fin2?.teamId.trim()].filter(Boolean) as string[],
    );
    const staleFinalistSlots = new Set(
      stalePicks
        .filter((s) => s.predictionKind === "finalist")
        .map((s) => s.slotKey),
    );

    if (
      fin1?.teamId.trim() &&
      fin2?.teamId.trim() &&
      fin1Branch != null &&
      fin2Branch != null &&
      fin1Branch === fin2Branch
    ) {
      pushStale({
        slot: "champion",
        predictionKind: "champion",
        slotKey: null,
        savedTeamId: champId,
        savedTeamName: teamNameOrId(champId, teamName),
        actualBranch: branchLabel(teamTopologyBranchFromSlots(champId, slots)),
        expectedBranch: "M101 vs M102",
        reason:
          "Champion pick assumes a Final between two teams from the same semi-final branch.",
        rowState: rowState(champ),
        pruneReason: null,
        topologyIssue: "champion_on_stale_finalist_path",
      });
    } else if (
      validFinalTeamIds.size > 0 &&
      !validFinalTeamIds.has(champId)
    ) {
      pushStale({
        slot: "champion",
        predictionKind: "champion",
        slotKey: null,
        savedTeamId: champId,
        savedTeamName: teamNameOrId(champId, teamName),
        actualBranch: branchLabel(teamTopologyBranchFromSlots(champId, slots)),
        expectedBranch: "valid Final pairing",
        reason: "Champion must be one of the saved finalist picks under corrected topology.",
        rowState: rowState(champ),
        pruneReason: null,
        topologyIssue: "champion_not_in_valid_final",
      });
    } else if (
      staleFinalistSlots.size > 0 &&
      ((staleFinalistSlots.has("1") && fin1?.teamId.trim() === champId) ||
        (staleFinalistSlots.has("2") && fin2?.teamId.trim() === champId))
    ) {
      pushStale({
        slot: "champion",
        predictionKind: "champion",
        slotKey: null,
        savedTeamId: champId,
        savedTeamName: teamNameOrId(champId, teamName),
        actualBranch: branchLabel(teamTopologyBranchFromSlots(champId, slots)),
        expectedBranch: "opposite semi-final branch",
        reason:
          "Champion matches a finalist pick that is stale under corrected topology.",
        rowState: rowState(champ),
        pruneReason: null,
        topologyIssue: "champion_on_stale_finalist_path",
      });
    }
  }

  for (const cleared of pathRepairCleared) {
    if (!isSfPlusKind(cleared.predictionKind)) continue;
    if (cleared.reason === "upstream_incomplete") continue;

    const row = slots.find((s) => s.rowKey === cleared.rowKey);
    const teamId = row?.teamId.trim() || cleared.teamId.trim();
    if (!teamId) continue;

    const already = stalePicks.some(
      (s) =>
        s.predictionKind === cleared.predictionKind &&
        s.slotKey === cleared.slotKey &&
        s.savedTeamId === teamId,
    );
    if (already) continue;

    if (cleared.predictionKind === "semifinalist") {
      const qfIndex = cleared.slotKey ? Number(cleared.slotKey) - 1 : null;
      if (qfIndex == null || Number.isNaN(qfIndex)) continue;
      const branch = topologyBranchFromQfIndex(qfIndex);
      if (branch == null) continue;
      pushStale({
        slot: auditSlotLabel("semifinalist", cleared.slotKey),
        predictionKind: "semifinalist",
        slotKey: cleared.slotKey,
        savedTeamId: teamId,
        savedTeamName: teamNameOrId(teamId, teamName),
        actualBranch: branchLabel(branch),
        expectedBranch: branchLabel(branch),
        reason:
          "Saved quarter-final winner would be cleared by official path repair (not in valid QF matchup).",
        rowState: rowState(row),
        pruneReason: cleared.reason,
        topologyIssue: "wrong_semifinal_branch",
      });
      continue;
    }

    if (cleared.predictionKind === "finalist" && cleared.slotKey) {
      const expected = expectedBranchForFinalistSlot(cleared.slotKey);
      const actual = teamTopologyBranchFromSlots(teamId, slots);
      if (actual != null && actual !== expected) {
        pushStale({
          slot: auditSlotLabel("finalist", cleared.slotKey),
          predictionKind: "finalist",
          slotKey: cleared.slotKey,
          savedTeamId: teamId,
          savedTeamName: teamNameOrId(teamId, teamName),
          actualBranch: branchLabel(actual),
          expectedBranch: branchLabel(expected),
          reason: wrongBranchReason({
            slotLabel:
              cleared.slotKey === "1" ? "finalist-1" : "finalist-2",
            teamName: teamNameOrId(teamId, teamName),
            actualBranch: branchLabel(actual),
            expectedBranch: branchLabel(expected),
          }),
          rowState: rowState(row),
          pruneReason: cleared.reason,
          topologyIssue: "wrong_semifinal_branch",
        });
      }
    }
  }

  if (hasAnySfPlusSavedPick(slots)) {
    for (const kind of SF_PLUS_KINDS) {
      const slotKeys =
        kind === "champion"
          ? [null]
          : kind === "finalist"
            ? ["1", "2"]
            : ["1", "2", "3", "4"];
      for (const slotKey of slotKeys) {
        const row = slotRow(slots, kind, slotKey);
        if (row?.teamId.trim()) continue;
        missingPicks.push({
          slot: auditSlotLabel(kind, slotKey),
          predictionKind: kind,
          slotKey,
          reason: `No saved ${auditSlotLabel(kind, slotKey).replace("_", " ")} pick.`,
        });
      }
    }
  }

  return { stalePicks, missingPicks, notes };
}

export function summarizeTopologyAuditTotals(input: {
  poolsScanned: number;
  participantsScanned: number;
  participantAudits: TopologyParticipantAudit[];
}): {
  participantsWithStalePicks: number;
  participantsWithOnlyMissingDownstream: number;
  staleSemifinalPicks: number;
  staleFinalistPicks: number;
  staleChampionPicks: number;
  lockedStalePicks: number;
} {
  let participantsWithStalePicks = 0;
  let participantsWithOnlyMissingDownstream = 0;
  let staleSemifinalPicks = 0;
  let staleFinalistPicks = 0;
  let staleChampionPicks = 0;
  let lockedStalePicks = 0;

  for (const audit of input.participantAudits) {
    if (audit.stalePicks.length > 0) {
      participantsWithStalePicks += 1;
    } else if (audit.missingPicks.length > 0) {
      participantsWithOnlyMissingDownstream += 1;
    }

    for (const stale of audit.stalePicks) {
      if (stale.predictionKind === "semifinalist") staleSemifinalPicks += 1;
      if (stale.predictionKind === "finalist") staleFinalistPicks += 1;
      if (stale.predictionKind === "champion") staleChampionPicks += 1;
      if (stale.rowState === "locked_out") lockedStalePicks += 1;
    }
  }

  return {
    participantsWithStalePicks,
    participantsWithOnlyMissingDownstream,
    staleSemifinalPicks,
    staleFinalistPicks,
    staleChampionPicks,
    lockedStalePicks,
  };
}
