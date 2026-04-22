import type { Result, Team } from "../../src/types/domain";
import {
  buildThirdPlaceTeamIdByGroupLetterFromTeamIds,
  resolveWc2026RoundOf32SlotTeamIds,
  thirdPlaceGroupLetterByWinnerSlot,
} from "../tournament/worldcup2026ThirdPlaceMapping";
import { WC2026_GROUP_CODES } from "../tournament/wc2026GroupCodes";

export type ParsedOfficialR32Input = {
  groupWinnerTeamIdByLetter: Record<string, string>;
  groupRunnerUpTeamIdByLetter: Record<string, string>;
  thirdQualifierTeamIds: string[];
  thirdPlaceTeamIdByGroupLetter: Record<string, string>;
  slotTeamIdByKey: Record<string, string>;
};

/**
 * Validates official `results` for group stage + eight third-place advancers and
 * resolves Annex C. Admin-oriented error strings.
 */
export function parseValidateAndResolveOfficialR32(input: {
  results: Result[];
  groupStageId: string;
  roundOf32StageId: string;
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
}): { ok: true; data: ParsedOfficialR32Input } | { ok: false; error: string } {
  const { results, groupStageId, roundOf32StageId, teams, groupTeamCountryCodesByLetter } =
    input;

  const gw: Record<string, string> = {};
  const gr: Record<string, string> = {};

  for (const r of results) {
    if (r.tournamentStageId !== groupStageId || !r.teamId?.trim()) continue;
    const g = (r.groupCode ?? "").toUpperCase();
    if (!g) continue;
    const tid = r.teamId.trim();
    if (r.kind === "group_winner") {
      if (gw[g] && gw[g] !== tid) {
        return {
          ok: false,
          error: `Conflicting official results: Group ${g} has more than one 1st-place team. Remove the duplicate row or align picks.`,
        };
      }
      gw[g] = tid;
    } else if (r.kind === "group_runner_up") {
      if (gr[g] && gr[g] !== tid) {
        return {
          ok: false,
          error: `Conflicting official results: Group ${g} has more than one 2nd-place team. Remove the duplicate row or align picks.`,
        };
      }
      gr[g] = tid;
    }
  }

  for (const L of WC2026_GROUP_CODES) {
    const letter = L.toUpperCase();
    if (!gw[letter]?.trim()) {
      return {
        ok: false,
        error: `Missing official 1st-place result for Group ${letter} (${Object.keys(gw).length}/12 groups have a winner).`,
      };
    }
    if (!gr[letter]?.trim()) {
      return {
        ok: false,
        error: `Missing official 2nd-place result for Group ${letter} (${Object.keys(gr).filter((k) => gr[k]?.trim()).length}/12 groups have a runner-up).`,
      };
    }
    if (gw[letter] === gr[letter]) {
      return {
        ok: false,
        error: `Group ${letter}: 1st and 2nd place cannot be the same team.`,
      };
    }
  }

  const allAutoQualifierIds = [
    ...WC2026_GROUP_CODES.map((L) => gw[L.toUpperCase()]!),
    ...WC2026_GROUP_CODES.map((L) => gr[L.toUpperCase()]!),
  ];
  const distinctTopTwo = new Set(allAutoQualifierIds);
  if (distinctTopTwo.size !== 24) {
    return {
      ok: false,
      error:
        "Each of the 24 group auto-qualifiers (12 winners + 12 runners-up) must be a different team. At least one nation appears more than once — check the official group results.",
    };
  }

  const advancerIds: string[] = [];
  const seenThirdTeam = new Set<string>();
  for (const r of results) {
    if (r.tournamentStageId !== roundOf32StageId || r.kind !== "third_place_qualifier") {
      continue;
    }
    if (!r.teamId?.trim()) continue;
    const tid = r.teamId.trim();
    if (seenThirdTeam.has(tid)) {
      return {
        ok: false,
        error:
          "Duplicate third-place advancer: the same team appears on more than one third-place result row. Each of the eight slots must be a different nation.",
      };
    }
    seenThirdTeam.add(tid);
    advancerIds.push(tid);
  }

  if (advancerIds.length !== 8) {
    return {
      ok: false,
      error: `Exactly eight official third-place advancers are required before resolving the Round of 32 (currently ${advancerIds.length}/8).`,
    };
  }

  const top24 = new Set<string>();
  for (const L of WC2026_GROUP_CODES) {
    const u = L.toUpperCase();
    top24.add(gw[u]!);
    top24.add(gr[u]!);
  }
  for (const tid of advancerIds) {
    if (top24.has(tid)) {
      return {
        ok: false,
        error:
          "A third-place advancer is the same team as an official 1st- or 2nd-place finisher in some group. Third-place qualifiers must be nations that did not auto-qualify in the top two of their group.",
      };
    }
  }

  const thirdByGroup = buildThirdPlaceTeamIdByGroupLetterFromTeamIds(
    advancerIds,
    teams,
    groupTeamCountryCodesByLetter,
  );
  if (!thirdByGroup) {
    return {
      ok: false,
      error:
        "Could not map each of the eight third-place teams to a distinct World Cup group using the official draw. Check for two teams from the same group, unknown teams, or an incomplete group schedule.",
    };
  }

  const letters = Object.keys(thirdByGroup).map((k) => k.toUpperCase());
  if (thirdPlaceGroupLetterByWinnerSlot(letters) == null) {
    return {
      ok: false,
      error:
        "The set of eight advancing third-place groups is not recognized by FIFA Annex C for this tournament edition. Verify the eight official advancers match the real tournament.",
    };
  }

  const resolved = resolveWc2026RoundOf32SlotTeamIds({
    groupWinnerTeamIdByLetter: gw,
    groupRunnerUpTeamIdByLetter: gr,
    thirdPlaceTeamIdByGroupLetter: thirdByGroup,
  });
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return {
    ok: true,
    data: {
      groupWinnerTeamIdByLetter: gw,
      groupRunnerUpTeamIdByLetter: gr,
      thirdQualifierTeamIds: advancerIds,
      thirdPlaceTeamIdByGroupLetter: thirdByGroup,
      slotTeamIdByKey: { ...resolved.slotTeamIdByKey },
    },
  };
}

/** True when both JSON objects define the same 32 slot → team mappings. */
export function officialR32SlotMapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  for (let i = 1; i <= 32; i += 1) {
    const k = String(i);
    if ((a[k] ?? "").trim() !== (b[k] ?? "").trim()) return false;
  }
  return true;
}
