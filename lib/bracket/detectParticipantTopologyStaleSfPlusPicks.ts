import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ConfirmedR32WinnerContext } from "../picks/knockoutMatchPickRows";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import {
  auditKnockoutTopologyStalePicks,
  type TopologyParticipantAudit,
} from "./auditKnockoutTopologyStalePicks";
import {
  dedupeStaleFindingsForRepair,
  planClearsFromStaleFindings,
} from "./planKnockoutTopologyStalePickRepairs";

export function detectParticipantTopologyStaleSfPlusPicks(input: {
  slots: KnockoutPickSlotDraft[];
  ctx?: ConfirmedR32WinnerContext;
  teamName?: (teamId: string) => string;
}): {
  audit: TopologyParticipantAudit;
  stalePickCount: number;
  plannedClearCount: number;
  hasStalePicks: boolean;
  hasMissingOnly: boolean;
} {
  const pathRepair = pruneOfficialKnockoutPathPicks(input.slots, input.ctx);
  const audit = auditKnockoutTopologyStalePicks({
    slots: input.slots,
    teamName: input.teamName,
    pathRepairCleared: pathRepair.cleared.filter((c) =>
      ["semifinalist", "finalist", "champion"].includes(c.predictionKind),
    ),
  });
  const staleFindings = dedupeStaleFindingsForRepair(audit.stalePicks);
  const plannedClearCount = planClearsFromStaleFindings({
    poolId: "",
    poolName: "",
    participantId: "",
    participantName: "",
    participantEmail: null,
    slots: input.slots,
    staleFindings,
  }).length;

  return {
    audit: { ...audit, stalePicks: staleFindings },
    stalePickCount: staleFindings.length,
    plannedClearCount,
    hasStalePicks: staleFindings.length > 0,
    hasMissingOnly:
      staleFindings.length === 0 && audit.missingPicks.length > 0,
  };
}
