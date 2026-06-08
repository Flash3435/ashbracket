import type { PoolActivityType } from "./poolActivityTypes";
import type {
  GlobalActivityEngagementSummary,
  GlobalPoolEngagementOverviewRow,
} from "./globalActivityTypes";

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * MS_24H;

const PICKS_TYPES: ReadonlySet<PoolActivityType> = new Set([
  "participant_submitted_picks",
  "participant_updated_picks",
]);

type ActivityMetricRow = {
  pool_id: string;
  type: string;
  created_at: string;
};

type ReactionMetricRow = {
  pool_id: string;
  created_at: string;
};

function isWithinMs(iso: string, sinceMs: number, nowMs: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= sinceMs && t <= nowMs;
}

export function computeGlobalActivityEngagementSummary(input: {
  poolIds: string[];
  recentActivity: ActivityMetricRow[];
  recentReactions: ReactionMetricRow[];
  nowMs?: number;
}): GlobalActivityEngagementSummary {
  const nowMs = input.nowMs ?? Date.now();
  const since24h = nowMs - MS_24H;
  const since7d = nowMs - MS_7D;

  const activePools24h = new Set<string>();
  let activityItems24h = 0;
  let picksActivity24h = 0;
  let joins24h = 0;
  let announcements7d = 0;

  for (const row of input.recentActivity) {
    if (!isWithinMs(row.created_at, since24h, nowMs)) continue;
    activityItems24h += 1;
    activePools24h.add(row.pool_id);
    const t = row.type as PoolActivityType;
    if (PICKS_TYPES.has(t)) picksActivity24h += 1;
    if (t === "participant_joined") joins24h += 1;
  }

  for (const row of input.recentActivity) {
    if (row.type !== "announcement") continue;
    if (!isWithinMs(row.created_at, since7d, nowMs)) continue;
    announcements7d += 1;
  }

  let reactions24h = 0;
  const reactionPools24h = new Set<string>();
  for (const row of input.recentReactions) {
    if (!isWithinMs(row.created_at, since24h, nowMs)) continue;
    reactions24h += 1;
    reactionPools24h.add(row.pool_id);
  }

  for (const poolId of reactionPools24h) {
    activePools24h.add(poolId);
  }

  const activityPools24h = new Set<string>();
  const activityPools7d = new Set<string>();
  for (const row of input.recentActivity) {
    if (isWithinMs(row.created_at, since24h, nowMs)) {
      activityPools24h.add(row.pool_id);
    }
    if (isWithinMs(row.created_at, since7d, nowMs)) {
      activityPools7d.add(row.pool_id);
    }
  }
  for (const row of input.recentReactions) {
    if (isWithinMs(row.created_at, since24h, nowMs)) {
      activityPools24h.add(row.pool_id);
    }
    if (isWithinMs(row.created_at, since7d, nowMs)) {
      activityPools7d.add(row.pool_id);
    }
  }

  let quietPools24h = 0;
  let quietPools7d = 0;
  for (const poolId of input.poolIds) {
    if (!activityPools24h.has(poolId)) quietPools24h += 1;
    if (!activityPools7d.has(poolId)) quietPools7d += 1;
  }

  return {
    activePools24h: activePools24h.size,
    activityItems24h,
    picksActivity24h,
    joins24h,
    reactions24h,
    announcements7d,
    quietPools24h,
    quietPools7d,
  };
}

export function buildGlobalPoolEngagementOverview(input: {
  pools: Array<{ id: string; name: string }>;
  participantCountsByPoolId: Map<string, number>;
  completedBracketsByPoolId: Map<string, number | null>;
  recentActivity: ActivityMetricRow[];
  recentReactions: ReactionMetricRow[];
  nowMs?: number;
}): GlobalPoolEngagementOverviewRow[] {
  const nowMs = input.nowMs ?? Date.now();
  const since24h = nowMs - MS_24H;

  const lastActivityByPool = new Map<string, string>();
  const activity24hByPool = new Map<string, number>();
  const reactions24hByPool = new Map<string, number>();

  for (const row of input.recentActivity) {
    const prev = lastActivityByPool.get(row.pool_id);
    if (!prev || Date.parse(row.created_at) > Date.parse(prev)) {
      lastActivityByPool.set(row.pool_id, row.created_at);
    }
    if (isWithinMs(row.created_at, since24h, nowMs)) {
      activity24hByPool.set(
        row.pool_id,
        (activity24hByPool.get(row.pool_id) ?? 0) + 1,
      );
    }
  }

  for (const row of input.recentReactions) {
    if (!isWithinMs(row.created_at, since24h, nowMs)) continue;
    reactions24hByPool.set(
      row.pool_id,
      (reactions24hByPool.get(row.pool_id) ?? 0) + 1,
    );
  }

  return input.pools
    .map((pool) => ({
      poolId: pool.id,
      poolName: pool.name,
      participantCount: input.participantCountsByPoolId.get(pool.id) ?? 0,
      completedBrackets:
        input.completedBracketsByPoolId.get(pool.id) ?? null,
      lastActivityAt: lastActivityByPool.get(pool.id) ?? null,
      activityCount24h: activity24hByPool.get(pool.id) ?? 0,
      reactionsCount24h: reactions24hByPool.get(pool.id) ?? 0,
    }))
    .sort((a, b) => {
      const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return tb - ta;
    });
}
