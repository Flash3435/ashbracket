import type { PoolActivityFeedRow } from "./poolActivityTypes";

export type GlobalPoolActivityFeedRow = PoolActivityFeedRow & {
  pool_id: string;
  pool_name: string;
  ashbot_enabled: boolean;
};

export type GlobalActivityEngagementSummary = {
  activePools24h: number;
  activityItems24h: number;
  picksActivity24h: number;
  joins24h: number;
  reactions24h: number;
  announcements7d: number;
  quietPools24h: number;
  quietPools7d: number;
};

export type GlobalPoolEngagementOverviewRow = {
  poolId: string;
  poolName: string;
  participantCount: number;
  completedBrackets: number | null;
  lastActivityAt: string | null;
  activityCount24h: number;
  reactionsCount24h: number;
};
