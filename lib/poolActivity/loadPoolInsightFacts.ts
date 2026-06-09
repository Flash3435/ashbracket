import type { SupabaseClient } from "@supabase/supabase-js";
import { loadParticipantIdsWithIncompletePicks } from "../communications/picksCompleteness";
import { fetchAllRows } from "../supabase/fetchAllRows";
import { isOftenPickedTeam, isWildCardTeam } from "../teams/teamStrengthLabel";
import {
  type ChampionTeamStat,
  type PoolInsightFacts,
} from "./buildPoolInsightCandidates";
import { loadRecapFacts } from "./loadRecapFacts";
import { edmontonDayStartIso } from "./recapCalendarDate";

const KNOCKOUT_PRESENCE_KINDS = [
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

function countActivitySince(
  rows: Array<{ type: string; created_at: string }>,
  sinceIso: string,
  typeFilter?: (type: string) => boolean,
): number {
  const sinceMs = new Date(sinceIso).getTime();
  return rows.filter((r) => {
    if (typeFilter && !typeFilter(r.type)) return false;
    return new Date(r.created_at).getTime() >= sinceMs;
  }).length;
}

async function loadRecentPoolActivity(
  supabase: SupabaseClient,
  poolId: string,
  sinceIso: string,
): Promise<Array<{ type: string; created_at: string }>> {
  const { data, error } = await supabase
    .from("pool_activity")
    .select("type, created_at")
    .eq("pool_id", poolId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    type: r.type as string,
    created_at: r.created_at as string,
  }));
}

async function loadPostLockPickAggregates(
  supabase: SupabaseClient,
  poolId: string,
  completeParticipantIds: string[],
): Promise<
  Pick<
    PoolInsightFacts,
    | "championStats"
    | "oftenPickedZeroChampion"
    | "uniqueChampionPicks"
    | "topPresenceTeam"
    | "underdogFinalistBracketCount"
  >
> {
  if (completeParticipantIds.length === 0) {
    return {
      championStats: [],
      oftenPickedZeroChampion: [],
      uniqueChampionPicks: [],
      topPresenceTeam: null,
      underdogFinalistBracketCount: 0,
    };
  }

  type InsightPredRow = {
    participant_id: string;
    team_id: string;
    prediction_kind: string;
    teams:
      | { id: string; name: string; country_code: string | null }
      | Array<{ id: string; name: string; country_code: string | null }>
      | null;
  };

  const { data: predRows, error: pErr } = await fetchAllRows<InsightPredRow>(
    async ({ from, to }) =>
      supabase
        .from("predictions")
        .select(
          "participant_id, team_id, prediction_kind, teams ( id, name, country_code )",
        )
        .eq("pool_id", poolId)
        .in("participant_id", completeParticipantIds)
        .not("team_id", "is", null)
        .in("prediction_kind", [...KNOCKOUT_PRESENCE_KINDS])
        .order("id", { ascending: true })
        .range(from, to),
  );

  if (pErr) throw new Error(pErr);

  type TeamEmbed = { id: string; name: string; country_code: string | null };
  const championByTeam = new Map<string, ChampionTeamStat>();
  const presenceByTeam = new Map<string, { name: string; participants: Set<string> }>();
  const underdogFinalistParticipants = new Set<string>();
  const oftenPickedInPool = new Map<string, ChampionTeamStat>();

  for (const row of predRows ?? []) {
    const teamRel = row.teams as TeamEmbed | TeamEmbed[] | null;
    const team = Array.isArray(teamRel) ? teamRel[0] : teamRel;
    if (!team?.id) continue;

    const teamId = team.id;
    const teamName = (team.name as string)?.trim() || "Unknown team";
    const countryCode = (team.country_code as string | null) ?? "";
    const participantId = row.participant_id as string;
    const kind = row.prediction_kind as string;

    if (kind === "champion") {
      const prev = championByTeam.get(teamId);
      if (prev) {
        prev.count += 1;
      } else {
        championByTeam.set(teamId, { teamId, teamName, count: 1 });
      }
    }

    if (KNOCKOUT_PRESENCE_KINDS.includes(kind as (typeof KNOCKOUT_PRESENCE_KINDS)[number])) {
      let entry = presenceByTeam.get(teamId);
      if (!entry) {
        entry = { name: teamName, participants: new Set() };
        presenceByTeam.set(teamId, entry);
      }
      entry.participants.add(participantId);
    }

    if (kind === "finalist" && isWildCardTeam(countryCode)) {
      underdogFinalistParticipants.add(participantId);
    }

    if (isOftenPickedTeam(countryCode)) {
      oftenPickedInPool.set(teamId, { teamId, teamName, count: 0 });
    }
  }

  const championStats = [...championByTeam.values()].sort(
    (a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName),
  );

  const uniqueChampionPicks = championStats.filter((s) => s.count === 1);

  const oftenPickedZeroChampion = [...oftenPickedInPool.values()]
    .filter((t) => !championByTeam.has(t.teamId))
    .sort((a, b) => a.teamName.localeCompare(b.teamName))
    .slice(0, 3);

  let topPresenceTeam: PoolInsightFacts["topPresenceTeam"] = null;
  let maxPresence = 0;
  let presenceLeaders: Array<{ teamId: string; teamName: string; bracketCount: number }> =
    [];
  for (const [teamId, { name, participants }] of presenceByTeam) {
    const bracketCount = participants.size;
    if (bracketCount > maxPresence) {
      maxPresence = bracketCount;
      presenceLeaders = [{ teamId, teamName: name, bracketCount }];
    } else if (bracketCount === maxPresence && bracketCount > 0) {
      presenceLeaders.push({ teamId, teamName: name, bracketCount });
    }
  }
  if (presenceLeaders.length === 1 && maxPresence >= 3) {
    topPresenceTeam = presenceLeaders[0]!;
  }

  return {
    championStats,
    oftenPickedZeroChampion,
    uniqueChampionPicks,
    topPresenceTeam,
    underdogFinalistBracketCount: underdogFinalistParticipants.size,
  };
}

/**
 * Loads pool facts for insight candidate evaluation (service role or member RLS).
 */
export async function loadPoolInsightFacts(
  supabase: SupabaseClient,
  poolId: string,
  nowMs = Date.now(),
): Promise<PoolInsightFacts> {
  const now = new Date(nowMs);
  const dayStartIso = edmontonDayStartIso(now);
  const last24hIso = new Date(nowMs - 24 * 3600_000).toISOString();
  const activitySinceIso =
    new Date(dayStartIso).getTime() < new Date(last24hIso).getTime()
      ? dayStartIso
      : last24hIso;

  const [{ facts, participantRows }, poolRow, recentActivity] = await Promise.all([
    loadRecapFacts(supabase, poolId),
    supabase.from("pools").select("lock_at").eq("id", poolId).maybeSingle(),
    loadRecentPoolActivity(supabase, poolId, activitySinceIso),
  ]);

  if (poolRow.error) throw new Error(poolRow.error.message);

  const lockAt = (poolRow.data?.lock_at as string | null) ?? null;
  const lockMs = lockAt ? new Date(lockAt).getTime() : NaN;
  const locked =
    lockAt != null &&
    lockAt !== "" &&
    !Number.isNaN(lockMs) &&
    lockMs <= nowMs;

  const participantIds = participantRows.map((r) => r.id);
  const incomplete = await loadParticipantIdsWithIncompletePicks(
    supabase,
    poolId,
    participantIds,
  );
  const completeParticipantIds = participantIds.filter((id) => !incomplete.has(id));

  const joinsLast24h = countActivitySince(
    recentActivity,
    last24hIso,
    (t) => t === "participant_joined",
  );
  const updatesToday = countActivitySince(
    recentActivity,
    dayStartIso,
    (t) => t === "participant_updated_picks",
  );
  const activityToday = countActivitySince(recentActivity, dayStartIso);

  const base: PoolInsightFacts = {
    participantCount: facts.participantCount,
    submittedCount: facts.submittedCount,
    locked,
    joinsLast24h,
    updatesToday,
    activityToday,
  };

  if (!locked) return base;

  const aggregates = await loadPostLockPickAggregates(
    supabase,
    poolId,
    completeParticipantIds,
  );

  return {
    ...base,
    ...aggregates,
  };
}
