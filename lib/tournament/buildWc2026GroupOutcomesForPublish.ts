import type { SupabaseClient } from "@supabase/supabase-js";
import type { Team } from "../../src/types/domain";
import { computeGroupStandings, type GroupStanding } from "./groupStandings";
import { WC2026_GROUP_CODES } from "./wc2026GroupCodes";
import { fetchGroupTeamCountryCodesForEdition } from "./fetchGroupTeamCountryCodesForEdition";
import { buildThirdPlaceTeamIdByGroupLetterFromTeamIds } from "./worldcup2026ThirdPlaceMapping";
import type { Wc2026PartialGroupOutcomes } from "./resolvePartialWc2026RoundOf32Teams";

type DbGroupMatch = {
  group_code: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
};

function compareThirdPlaceCandidates(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const da = a.goalsFor - a.goalsAgainst;
  const db = b.goalsFor - b.goalsAgainst;
  if (db !== da) return db - da;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId);
}

function groupOutcomesFromFinishedMatches(
  groupMatches: DbGroupMatch[],
): {
  groupWinnerTeamIdByLetter: Record<string, string>;
  groupRunnerUpTeamIdByLetter: Record<string, string>;
  thirdPlaceCandidates: Array<GroupStanding & { groupCode: string }>;
} {
  const groupWinnerTeamIdByLetter: Record<string, string> = {};
  const groupRunnerUpTeamIdByLetter: Record<string, string> = {};
  const thirdPlaceCandidates: Array<GroupStanding & { groupCode: string }> = [];

  const byGroup = new Map<string, DbGroupMatch[]>();
  for (const m of groupMatches) {
    const g = (m.group_code ?? "").toUpperCase();
    if (!g) continue;
    const list = byGroup.get(g) ?? [];
    list.push(m);
    byGroup.set(g, list);
  }

  for (const letter of WC2026_GROUP_CODES) {
    const g = letter.toUpperCase();
    const rows = byGroup.get(g) ?? [];
    if (rows.length !== 6) continue;

    const finished = rows.flatMap((m) => {
      if (
        m.home_team_id &&
        m.away_team_id &&
        m.home_goals != null &&
        m.away_goals != null
      ) {
        return [
          {
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            homeGoals: m.home_goals,
            awayGoals: m.away_goals,
          },
        ];
      }
      return [];
    });
    if (finished.length !== 6) continue;

    const teamIds = [
      ...new Set(finished.flatMap((x) => [x.homeTeamId, x.awayTeamId])),
    ];
    const standings = computeGroupStandings(teamIds, finished);
    if (!standings || standings.length < 3) continue;

    groupWinnerTeamIdByLetter[g] = standings[0]!.teamId;
    groupRunnerUpTeamIdByLetter[g] = standings[1]!.teamId;
    thirdPlaceCandidates.push({ ...standings[2]!, groupCode: g });
  }

  return {
    groupWinnerTeamIdByLetter,
    groupRunnerUpTeamIdByLetter,
    thirdPlaceCandidates,
  };
}

type ResultRow = {
  tournamentStageId: string;
  kind: string;
  teamId: string | null;
  groupCode: string | null;
};

function mergeGroupOutcomesFromResults(
  base: {
    groupWinnerTeamIdByLetter: Record<string, string>;
    groupRunnerUpTeamIdByLetter: Record<string, string>;
  },
  results: ResultRow[],
  groupStageId: string,
): void {
  for (const r of results) {
    if (r.tournamentStageId !== groupStageId || !r.teamId?.trim()) continue;
    const g = (r.groupCode ?? "").toUpperCase();
    if (!g) continue;
    const tid = r.teamId.trim();
    if (r.kind === "group_winner") {
      base.groupWinnerTeamIdByLetter[g] = tid;
    } else if (r.kind === "group_runner_up") {
      base.groupRunnerUpTeamIdByLetter[g] = tid;
    }
  }
}

function thirdPlaceFromResults(
  results: ResultRow[],
  roundOf32StageId: string,
  teams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]>,
): Record<string, string> {
  const advancerIds: string[] = [];
  for (const r of results) {
    if (r.tournamentStageId !== roundOf32StageId || r.kind !== "third_place_qualifier") {
      continue;
    }
    if (!r.teamId?.trim()) continue;
    advancerIds.push(r.teamId.trim());
  }
  if (advancerIds.length !== 8) return {};
  const mapped = buildThirdPlaceTeamIdByGroupLetterFromTeamIds(
    advancerIds,
    teams,
    groupTeamCountryCodesByLetter,
  );
  return mapped ?? {};
}

/**
 * Builds the best available group outcomes for progressive R32 publishing.
 * Match-derived standings take precedence; official `results` rows fill gaps.
 */
export async function buildWc2026GroupOutcomesForPublish(
  supabase: SupabaseClient,
  editionId: string,
): Promise<
  | { ok: true; outcomes: Wc2026PartialGroupOutcomes }
  | { ok: false; error: string }
> {
  const [stageRes, matchRes, resultRes, teamRes, groupTeamCountryCodesByLetter] =
    await Promise.all([
    supabase.from("tournament_stages").select("id, code"),
    supabase
      .from("tournament_matches")
      .select(
        "group_code, home_team_id, away_team_id, home_goals, away_goals, stage_code",
      )
      .eq("edition_id", editionId)
      .eq("stage_code", "group"),
    supabase
      .from("results")
      .select(
        "tournament_stage_id, kind, team_id, group_code, slot_key, locked, source",
      )
      .eq("edition_id", editionId),
    supabase.from("teams").select("id, country_code, name"),
    fetchGroupTeamCountryCodesForEdition(supabase, editionId),
  ]);

  if (stageRes.error) return { ok: false, error: stageRes.error.message };
  if (matchRes.error) return { ok: false, error: matchRes.error.message };
  if (resultRes.error) return { ok: false, error: resultRes.error.message };
  if (teamRes.error) return { ok: false, error: teamRes.error.message };

  const stageByCode = new Map(
    (stageRes.data ?? []).map((s) => [s.code as string, s.id as string]),
  );
  const groupStageId = stageByCode.get("group");
  const r32StageId = stageByCode.get("round_of_32");
  if (!groupStageId || !r32StageId) {
    return { ok: false, error: "Missing tournament stage rows for group or round_of_32." };
  }

  const fromMatches = groupOutcomesFromFinishedMatches(
    (matchRes.data ?? []) as DbGroupMatch[],
  );

  const groupWinnerTeamIdByLetter = { ...fromMatches.groupWinnerTeamIdByLetter };
  const groupRunnerUpTeamIdByLetter = { ...fromMatches.groupRunnerUpTeamIdByLetter };

  const resultRows = (resultRes.data ?? []).map((r) => ({
    tournamentStageId: r.tournament_stage_id as string,
    kind: r.kind as string,
    teamId: r.team_id as string | null,
    groupCode: r.group_code as string | null,
  })) satisfies ResultRow[];

  mergeGroupOutcomesFromResults(
    { groupWinnerTeamIdByLetter, groupRunnerUpTeamIdByLetter },
    resultRows,
    groupStageId,
  );

  const teams = (teamRes.data ?? []).map((t) => ({
    id: t.id as string,
    countryCode: t.country_code as string,
    name: t.name as string,
  })) as Team[];

  let thirdPlaceTeamIdByGroupLetter = thirdPlaceFromResults(
    resultRows,
    r32StageId,
    teams,
    groupTeamCountryCodesByLetter,
  );

  if (Object.keys(thirdPlaceTeamIdByGroupLetter).length === 0) {
    const completeGroups = WC2026_GROUP_CODES.filter((L) => {
      const g = L.toUpperCase();
      return (
        Boolean(groupWinnerTeamIdByLetter[g]) &&
        Boolean(groupRunnerUpTeamIdByLetter[g])
      );
    });
    if (completeGroups.length === WC2026_GROUP_CODES.length) {
      const sorted = [...fromMatches.thirdPlaceCandidates].sort(compareThirdPlaceCandidates);
      if (sorted.length === WC2026_GROUP_CODES.length) {
        thirdPlaceTeamIdByGroupLetter = Object.fromEntries(
          sorted.slice(0, 8).map((row) => [row.groupCode, row.teamId]),
        );
      }
    }
  }

  return {
    ok: true,
    outcomes: {
      groupWinnerTeamIdByLetter,
      groupRunnerUpTeamIdByLetter,
      thirdPlaceTeamIdByGroupLetter,
    },
  };
}
