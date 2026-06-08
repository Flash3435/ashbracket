import {
  formatActivityItemCount,
  formatBracketCount,
  formatNewParticipantsJoined,
  formatPeopleUpdatedPicks,
  verbHasHave,
  verbIsAre,
} from "../copy/pluralize";
import { shouldShowChampionInsight, type RecapFacts } from "./buildDeterministicRecapBody";
import { recapCalendarDateYmdEdmonton } from "./recapCalendarDate";
import { preLockRollingSourceKey } from "./rollingPoolInsightKeys";
import type { PoolInsightLabel } from "./poolActivityTypes";

export type ChampionTeamStat = {
  teamId: string;
  teamName: string;
  count: number;
};

export type BracketPresenceStat = {
  teamId: string;
  teamName: string;
  bracketCount: number;
};

/** Inputs for pure pool insight candidate evaluation. */
export type PoolInsightFacts = {
  participantCount: number;
  submittedCount: number;
  locked: boolean;
  joinsLast24h: number;
  updatesToday: number;
  activityToday: number;
  /** Champion pick counts among complete brackets; only populated when locked. */
  championStats?: ChampionTeamStat[];
  /** Often-picked teams with zero champion picks; only when locked. */
  oftenPickedZeroChampion?: ChampionTeamStat[];
  /** Teams with exactly one champion pick; only when locked. */
  uniqueChampionPicks?: ChampionTeamStat[];
  /** Team appearing in the most complete brackets; only when locked. */
  topPresenceTeam?: BracketPresenceStat | null;
  /** Complete brackets with at least one wild-card finalist pick; only when locked. */
  underdogFinalistBracketCount?: number;
};

export type PoolInsightCandidate = {
  sourceKey: string;
  label: PoolInsightLabel;
  icon: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

const COMPLETION_PERCENT_BUCKETS = [50, 75, 90] as const;

function formatTeamList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function championUniqueLeader(stats: ChampionTeamStat[]): {
  top: ChampionTeamStat | null;
  unique: boolean;
} {
  if (stats.length === 0) return { top: null, unique: false };
  const max = Math.max(...stats.map((s) => s.count));
  const leaders = stats.filter((s) => s.count === max);
  return { top: leaders[0] ?? null, unique: leaders.length === 1 };
}

/**
 * Pre-lock engagement insights — no team or pick strategy details.
 */
export function buildPreLockPoolInsightCandidates(
  facts: PoolInsightFacts,
  nowMs = Date.now(),
): PoolInsightCandidate[] {
  if (facts.locked) return [];

  const { participantCount, submittedCount } = facts;
  if (participantCount <= 0) return [];

  const out: PoolInsightCandidate[] = [];
  const dayYmd = recapCalendarDateYmdEdmonton(new Date(nowMs));
  const remaining = participantCount - submittedCount;
  const pct =
    participantCount > 0 ? Math.round((submittedCount / participantCount) * 100) : 0;

  if (submittedCount >= 2) {
    for (const bucket of COMPLETION_PERCENT_BUCKETS) {
      if (pct >= bucket) {
        out.push({
          sourceKey: `prelock_completion_percent_${bucket}`,
          label: "POOL INSIGHT",
          icon: "📊",
          body: `📊 ${formatBracketCount(submittedCount)} ${verbIsAre(submittedCount)} in. The pool is ${pct}% ready.`,
          metadata: {
            completed_count: submittedCount,
            participant_count: participantCount,
            completion_percent: pct,
          },
        });
      }
    }
  }

  if (remaining > 0 && remaining <= 3 && submittedCount > 0) {
    out.push({
      sourceKey: preLockRollingSourceKey("remaining", dayYmd),
      label: "POOL INSIGHT",
      icon: "⏳",
      body: `⏳ Only ${formatBracketCount(remaining)} left to complete.`,
      metadata: {
        remaining_count: remaining,
        participant_count: participantCount,
        insight_day: dayYmd,
      },
    });
  }

  if (facts.updatesToday >= 2) {
    out.push({
      sourceKey: preLockRollingSourceKey("pick_updates", dayYmd),
      label: "POOL INSIGHT",
      icon: "✏️",
      body: `✏️ ${formatPeopleUpdatedPicks(facts.updatesToday)} today.`,
      metadata: { updates_today: facts.updatesToday, insight_day: dayYmd },
    });
  }

  if (facts.joinsLast24h >= 2) {
    out.push({
      sourceKey: preLockRollingSourceKey("joins", dayYmd),
      label: "POOL INSIGHT",
      icon: "👋",
      body: `👋 ${formatNewParticipantsJoined(facts.joinsLast24h)} in the last 24 hours.`,
      metadata: { joins_last_24h: facts.joinsLast24h, insight_day: dayYmd },
    });
  }

  if (facts.activityToday >= 6) {
    out.push({
      sourceKey: preLockRollingSourceKey("activity_heat", dayYmd),
      label: "POOL INSIGHT",
      icon: "🔥",
      body: `🔥 The pool is heating up: ${formatActivityItemCount(facts.activityToday)} today.`,
      metadata: {
        activity_today: facts.activityToday,
        evaluated_at_ms: nowMs,
        insight_day: dayYmd,
      },
    });
  }

  return out;
}

/**
 * Post-lock aggregate pick insights — counts only, no participant names.
 */
export function buildPostLockPoolInsightCandidates(
  facts: PoolInsightFacts,
): PoolInsightCandidate[] {
  if (!facts.locked) return [];

  const { submittedCount, championStats = [] } = facts;
  if (submittedCount < 2) return [];

  const out: PoolInsightCandidate[] = [];
  const sortedChamps = [...championStats].sort(
    (a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName),
  );
  const { top, unique } = championUniqueLeader(sortedChamps);

  const recapFacts: RecapFacts = {
    participantCount: facts.participantCount,
    submittedCount: facts.submittedCount,
    topChampionTeamName: top?.teamName ?? null,
    topChampionTeamId: top?.teamId ?? null,
    topChampionPickCount: top?.count ?? 0,
    championUniqueLeader: unique,
  };

  if (top && shouldShowChampionInsight(recapFacts)) {
    out.push({
      sourceKey: "postlock_top_champion",
      label: "POOL INSIGHT",
      icon: "👑",
      body: `👑 ${top.teamName} is the most popular champion pick.`,
      metadata: {
        team_id: top.teamId,
        team_name: top.teamName,
        pick_count: top.count,
      },
    });
  } else if (sortedChamps.length >= 2) {
    const topThree = sortedChamps.slice(0, 3).map((s) => s.teamName);
    out.push({
      sourceKey: "postlock_top_3_champions",
      label: "POOL INSIGHT",
      icon: "📊",
      body: `📊 ${formatTeamList(topThree)} are the top champion picks.`,
      metadata: {
        team_names: topThree,
        team_ids: sortedChamps.slice(0, 3).map((s) => s.teamId),
      },
    });
  }

  for (const team of facts.uniqueChampionPicks ?? []) {
    if (team.count !== 1) continue;
    out.push({
      sourceKey: `postlock_unique_champion_pick_${team.teamId}`,
      label: "POOL INSIGHT",
      icon: "🧠",
      body: `🧠 One bracket picked ${team.teamName} to win it all.`,
      metadata: {
        team_id: team.teamId,
        team_name: team.teamName,
        pick_count: 1,
      },
    });
  }

  for (const team of facts.oftenPickedZeroChampion ?? []) {
    out.push({
      sourceKey: `postlock_no_champion_pick_${team.teamId}`,
      label: "POOL INSIGHT",
      icon: "👀",
      body: `👀 No one picked ${team.teamName} as champion.`,
      metadata: {
        team_id: team.teamId,
        team_name: team.teamName,
      },
    });
  }

  const presence = facts.topPresenceTeam;
  if (presence && presence.bracketCount >= 3) {
    out.push({
      sourceKey: `postlock_top_bracket_presence_${presence.teamId}`,
      label: "POOL INSIGHT",
      icon: "🏆",
      body: `🏆 ${presence.teamName} appears in ${formatBracketCount(presence.bracketCount)}.`,
      metadata: {
        team_id: presence.teamId,
        team_name: presence.teamName,
        bracket_count: presence.bracketCount,
      },
    });
  }

  const underdogCount = facts.underdogFinalistBracketCount ?? 0;
  if (underdogCount >= 2) {
    out.push({
      sourceKey: `postlock_underdog_finalist_${underdogCount}`,
      label: "POOL INSIGHT",
      icon: "🌪️",
      body: `🌪️ ${formatBracketCount(underdogCount)} ${verbHasHave(underdogCount)} at least one major underdog finalist.`,
      metadata: { underdog_finalist_bracket_count: underdogCount },
    });
  }

  return out;
}

export function buildAllPoolInsightCandidates(
  facts: PoolInsightFacts,
  nowMs = Date.now(),
): PoolInsightCandidate[] {
  return [
    ...buildPreLockPoolInsightCandidates(facts, nowMs),
    ...buildPostLockPoolInsightCandidates(facts),
  ];
}
