import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  branchLabel,
  CORRECTED_TOPOLOGY,
  teamTopologyBranchFromSlots,
  type TopologyBranchIndex,
} from "./auditKnockoutTopologyStalePicks";
import {
  buildKnockoutMatchPickRows,
  type ConfirmedR32WinnerContext,
} from "../picks/knockoutMatchPickRows";
import { isValidSavedPickForMatchup } from "../picks/knockoutPickEditability";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  pruneOfficialKnockoutPathPicks,
  type ClearedKnockoutPathPick,
} from "../predictions/pruneOfficialKnockoutPathPicks";

export type SemifinalPickAuditSlot = "semifinal_101" | "semifinal_102";

export type SemifinalPickAuditStatus =
  | "valid"
  | "missing"
  | "stale_wrong_branch"
  | "stale_eliminated_or_impossible_path"
  | "upstream_incomplete";

export type SemifinalPickAuditFinding = {
  slot: SemifinalPickAuditSlot;
  matchNo: 101 | 102;
  status: SemifinalPickAuditStatus;
  savedTeamId: string | null;
  savedTeamName: string | null;
  expectedBranch: "M101" | "M102";
  actualBranch: "M101" | "M102" | null;
  locked: boolean;
  reason: string;
};

export type SemifinalParticipantAudit = {
  semifinalPicks: SemifinalPickAuditFinding[];
};

export type SemifinalAuditTotals = {
  poolsScanned: number;
  participantsScanned: number;
  participantsWithValidSemifinalPicks: number;
  participantsWithMissingSemifinalPicks: number;
  participantsWithStaleSemifinalPicks: number;
  validSemifinalPicks: number;
  missingSemifinalPicks: number;
  staleSemifinalPicks: number;
  validM101Picks: number;
  validM102Picks: number;
  missingM101Picks: number;
  missingM102Picks: number;
  staleM101Picks: number;
  staleM102Picks: number;
  lockedStaleSemifinalPicks: number;
};

const SF_MATCHES: ReadonlyArray<{
  matchIndex: 0 | 1;
  matchNo: 101 | 102;
  slot: SemifinalPickAuditSlot;
  expectedBranch: TopologyBranchIndex;
  saveSlotKey: "1" | "2";
}> = [
  {
    matchIndex: 0,
    matchNo: 101,
    slot: "semifinal_101",
    expectedBranch: 0,
    saveSlotKey: "1",
  },
  {
    matchIndex: 1,
    matchNo: 102,
    slot: "semifinal_102",
    expectedBranch: 1,
    saveSlotKey: "2",
  },
];

function teamNameOrId(
  teamId: string | null,
  resolve?: (teamId: string) => string,
): string | null {
  if (!teamId?.trim()) return null;
  return resolve?.(teamId) ?? teamId;
}

function findFinalistSaveRow(
  slots: KnockoutPickSlotDraft[],
  slotKey: "1" | "2",
): KnockoutPickSlotDraft | undefined {
  return slots.find(
    (s) => s.predictionKind === "finalist" && s.slotKey === slotKey,
  );
}

function pathRepairClearanceForFinalistSlot(
  cleared: readonly ClearedKnockoutPathPick[],
  slotKey: "1" | "2",
): ClearedKnockoutPathPick | undefined {
  return cleared.find(
    (c) => c.predictionKind === "finalist" && c.slotKey === slotKey,
  );
}

function wrongBranchReason(input: {
  teamName: string;
  actualBranch: string;
  expectedBranch: string;
  matchNo: number;
}): string {
  return `Saved team ${input.teamName} belongs to the ${input.actualBranch} branch but was saved as the M${input.matchNo} semifinal winner.`;
}

function auditOneSemifinalMatch(input: {
  matchIndex: 0 | 1;
  matchNo: 101 | 102;
  slot: SemifinalPickAuditSlot;
  expectedBranch: TopologyBranchIndex;
  saveSlotKey: "1" | "2";
  slots: KnockoutPickSlotDraft[];
  sfRow: ReturnType<typeof buildKnockoutMatchPickRows>[number] | undefined;
  pathRepairCleared: readonly ClearedKnockoutPathPick[];
  teamName?: (teamId: string) => string;
}): SemifinalPickAuditFinding {
  const {
    matchNo,
    slot,
    expectedBranch,
    saveSlotKey,
    slots,
    sfRow,
    pathRepairCleared,
    teamName,
  } = input;

  const saveRow = findFinalistSaveRow(slots, saveSlotKey);
  const savedTeamId = sfRow?.winnerTeamId.trim() || saveRow?.teamId.trim() || "";
  const locked = saveRow ? isKnockoutPickLockedOut(saveRow) : false;
  const expectedBranchLabel = branchLabel(expectedBranch) as "M101" | "M102";
  const pathClear = pathRepairClearanceForFinalistSlot(
    pathRepairCleared,
    saveSlotKey,
  );

  if (!savedTeamId) {
    return {
      slot,
      matchNo,
      status: "missing",
      savedTeamId: null,
      savedTeamName: null,
      expectedBranch: expectedBranchLabel,
      actualBranch: null,
      locked: false,
      reason: `No saved M${matchNo} semifinal winner pick.`,
    };
  }

  const savedTeamName = teamNameOrId(savedTeamId, teamName);
  const actualBranchIndex = teamTopologyBranchFromSlots(savedTeamId, slots);
  const actualBranch =
    actualBranchIndex == null
      ? null
      : (branchLabel(actualBranchIndex) as "M101" | "M102");

  const homeTeamId = sfRow?.homeTeamId ?? null;
  const awayTeamId = sfRow?.awayTeamId ?? null;
  const sidesComplete = Boolean(homeTeamId && awayTeamId);
  const inOfficialMatchup = isValidSavedPickForMatchup({
    savedTeamId,
    homeTeamId,
    awayTeamId,
    pickStatus: sfRow?.pickStatus ?? saveRow?.pickStatus ?? null,
  });

  if (actualBranch != null && actualBranch !== expectedBranchLabel) {
    return {
      slot,
      matchNo,
      status: "stale_wrong_branch",
      savedTeamId,
      savedTeamName,
      expectedBranch: expectedBranchLabel,
      actualBranch,
      locked,
      reason: wrongBranchReason({
        teamName: savedTeamName ?? savedTeamId,
        actualBranch,
        expectedBranch: expectedBranchLabel,
        matchNo,
      }),
    };
  }

  if (
    actualBranch == null &&
    (pathClear?.reason === "upstream_incomplete" ||
      (!sidesComplete && sfRow?.lockReason === "incomplete"))
  ) {
    return {
      slot,
      matchNo,
      status: "upstream_incomplete",
      savedTeamId,
      savedTeamName,
      expectedBranch: expectedBranchLabel,
      actualBranch,
      locked,
      reason:
        pathClear?.reason === "upstream_incomplete"
          ? "Semifinal pick cannot be validated because required quarter-final or round-of-16 feeder picks are incomplete."
          : `M${matchNo} feeder sides are incomplete — semifinal branch validation deferred until upstream picks are complete.`,
    };
  }

  if (
    pathClear?.reason === "not_in_official_matchup" ||
    (sidesComplete && !inOfficialMatchup)
  ) {
    return {
      slot,
      matchNo,
      status: "stale_eliminated_or_impossible_path",
      savedTeamId,
      savedTeamName,
      expectedBranch: expectedBranchLabel,
      actualBranch,
      locked,
      reason:
        "Saved semifinal winner is not a valid participant in the official M" +
        `${matchNo} matchup under the participant's upstream knockout path.`,
    };
  }

  return {
    slot,
    matchNo,
    status: "valid",
    savedTeamId,
    savedTeamName,
    expectedBranch: expectedBranchLabel,
    actualBranch,
    locked,
    reason: `Saved M${matchNo} semifinal winner is on the correct ${expectedBranchLabel} branch.`,
  };
}

/**
 * Read-only audit of saved M101/M102 semifinal winner picks (stored as finalist
 * slots 1/2). Does not mutate slots or infer replacements.
 */
export function auditKnockoutSemifinalPicks(input: {
  slots: KnockoutPickSlotDraft[];
  ctx?: ConfirmedR32WinnerContext;
  teamName?: (teamId: string) => string;
}): SemifinalParticipantAudit {
  const { slots, ctx, teamName } = input;
  const pathRepair = pruneOfficialKnockoutPathPicks(slots, ctx);
  const sfRows = buildKnockoutMatchPickRows({
    bracketKind: "semifinalist",
    slots,
    teams: ctx?.teams ?? [],
    tournamentMatches: ctx?.tournamentMatches ?? undefined,
    gradual: ctx?.gradual,
    knockoutBracketPicksUnlocked: ctx?.knockoutBracketPicksUnlocked ?? true,
  });

  const semifinalPicks = SF_MATCHES.map((def) =>
    auditOneSemifinalMatch({
      ...def,
      slots,
      sfRow: sfRows[def.matchIndex],
      pathRepairCleared: pathRepair.cleared,
      teamName,
    }),
  );

  return { semifinalPicks };
}

export function isStaleSemifinalPickStatus(
  status: SemifinalPickAuditStatus,
): boolean {
  return (
    status === "stale_wrong_branch" ||
    status === "stale_eliminated_or_impossible_path"
  );
}

export function summarizeSemifinalAuditTotals(input: {
  poolsScanned: number;
  participantsScanned: number;
  participantAudits: readonly SemifinalParticipantAudit[];
}): SemifinalAuditTotals {
  let participantsWithValidSemifinalPicks = 0;
  let participantsWithMissingSemifinalPicks = 0;
  let participantsWithStaleSemifinalPicks = 0;
  let validSemifinalPicks = 0;
  let missingSemifinalPicks = 0;
  let staleSemifinalPicks = 0;
  let validM101Picks = 0;
  let validM102Picks = 0;
  let missingM101Picks = 0;
  let missingM102Picks = 0;
  let staleM101Picks = 0;
  let staleM102Picks = 0;
  let lockedStaleSemifinalPicks = 0;

  for (const audit of input.participantAudits) {
    let hasValid = false;
    let hasMissing = false;
    let hasStale = false;

    for (const pick of audit.semifinalPicks) {
      if (pick.status === "valid") {
        validSemifinalPicks += 1;
        hasValid = true;
        if (pick.matchNo === 101) validM101Picks += 1;
        if (pick.matchNo === 102) validM102Picks += 1;
      } else if (pick.status === "missing") {
        missingSemifinalPicks += 1;
        hasMissing = true;
        if (pick.matchNo === 101) missingM101Picks += 1;
        if (pick.matchNo === 102) missingM102Picks += 1;
      } else if (isStaleSemifinalPickStatus(pick.status)) {
        staleSemifinalPicks += 1;
        hasStale = true;
        if (pick.matchNo === 101) staleM101Picks += 1;
        if (pick.matchNo === 102) staleM102Picks += 1;
        if (pick.locked) lockedStaleSemifinalPicks += 1;
      }
    }

    if (hasValid) participantsWithValidSemifinalPicks += 1;
    if (hasMissing) participantsWithMissingSemifinalPicks += 1;
    if (hasStale) participantsWithStaleSemifinalPicks += 1;
  }

  return {
    poolsScanned: input.poolsScanned,
    participantsScanned: input.participantsScanned,
    participantsWithValidSemifinalPicks,
    participantsWithMissingSemifinalPicks,
    participantsWithStaleSemifinalPicks,
    validSemifinalPicks,
    missingSemifinalPicks,
    staleSemifinalPicks,
    validM101Picks,
    validM102Picks,
    missingM101Picks,
    missingM102Picks,
    staleM101Picks,
    staleM102Picks,
    lockedStaleSemifinalPicks,
  };
}

export { CORRECTED_TOPOLOGY };
