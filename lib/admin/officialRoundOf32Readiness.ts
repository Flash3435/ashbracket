import type { Result, Team } from "../../src/types/domain";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";
import { parseValidateAndResolveOfficialR32 } from "./officialRoundOf32Validation";

export type OfficialR32ReadinessSummary = {
  groupsComplete: number;
  thirdPlaceQualifiersEntered: number;
  officialR32Resolvable: boolean;
  /** Short hint when not resolvable (first validation error). */
  resolvableHint: string | null;
};

/**
 * Read-only counts for `/admin/results` (no writes). `officialR32Resolvable` is true
 * only when a full Annex C resolution would succeed with current rows.
 */
export function getOfficialR32ReadinessSummary(input: {
  results: Result[];
  groupStageId: string | null;
  roundOf32StageId: string | null;
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
}): OfficialR32ReadinessSummary {
  const { results, groupStageId, roundOf32StageId, teams, groupTeamCountryCodesByLetter } =
    input;

  if (!groupStageId || !roundOf32StageId) {
    return {
      groupsComplete: 0,
      thirdPlaceQualifiersEntered: 0,
      officialR32Resolvable: false,
      resolvableHint: "Tournament stages are not loaded.",
    };
  }

  let groupsComplete = 0;
  for (const L of WC2026_GROUP_CODES) {
    const letter = L.toUpperCase();
    const hasW = results.some(
      (r) =>
        r.tournamentStageId === groupStageId &&
        r.kind === "group_winner" &&
        (r.groupCode ?? "").toUpperCase() === letter &&
        Boolean(r.teamId?.trim()),
    );
    const hasR = results.some(
      (r) =>
        r.tournamentStageId === groupStageId &&
        r.kind === "group_runner_up" &&
        (r.groupCode ?? "").toUpperCase() === letter &&
        Boolean(r.teamId?.trim()),
    );
    if (hasW && hasR) groupsComplete += 1;
  }

  const thirdPlaceQualifiersEntered = results.filter(
    (r) =>
      r.tournamentStageId === roundOf32StageId &&
      r.kind === "third_place_qualifier" &&
      Boolean(r.teamId?.trim()),
  ).length;

  const parsed = parseValidateAndResolveOfficialR32({
    results,
    groupStageId,
    roundOf32StageId,
    teams,
    groupTeamCountryCodesByLetter,
  });

  return {
    groupsComplete,
    thirdPlaceQualifiersEntered,
    officialR32Resolvable: parsed.ok,
    resolvableHint: parsed.ok ? null : parsed.error,
  };
}
