import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPoolActivityForPool } from "../poolActivity/fetchPoolActivity";
import { buildScoreImpactDisplayLines } from "../poolActivity/scoreImpact/buildScoreImpactDisplay";
import type { PoolActivityFeedRow } from "../poolActivity/poolActivityTypes";
import { buildScoreImpactDashboardDisplay } from "./parseLegacyScoreImpactDashboardBody";

export const RECENT_SCORE_IMPACT_DASHBOARD_LIMIT = 1;

export type RecentScoreImpactItem = {
  id: string;
  headline: string;
  detailLines: string[];
  showLeaderboardLink: boolean;
};

export function recentScoreImpactFromActivityRows(
  rows: PoolActivityFeedRow[],
  options: {
    allowParticipantNames: boolean;
    limit?: number;
  },
): RecentScoreImpactItem[] {
  const limit = options.limit ?? RECENT_SCORE_IMPACT_DASHBOARD_LIMIT;
  const scoreRows = rows.filter((r) => r.type === "ash_score_impact").slice(0, limit);

  const out: RecentScoreImpactItem[] = [];
  for (const row of scoreRows) {
    const display = buildScoreImpactDashboardDisplay(row.metadata_json, row.body_text, {
      allowParticipantNames: options.allowParticipantNames,
      buildStructured: buildScoreImpactDisplayLines,
    });
    if (!display) continue;
    out.push({
      id: row.id,
      headline: display.headline,
      detailLines: display.detailLines,
      showLeaderboardLink: display.showLeaderboardLink,
    });
  }
  return out;
}

export async function loadRecentScoreImpactForDashboard(
  supabase: SupabaseClient,
  poolId: string,
  options: {
    allowParticipantNames: boolean;
    limit?: number;
    fetchLimit?: number;
  },
): Promise<RecentScoreImpactItem[]> {
  const fetchLimit = options.fetchLimit ?? 15;
  const rows = await fetchPoolActivityForPool(supabase, poolId, fetchLimit);
  return recentScoreImpactFromActivityRows(rows, {
    allowParticipantNames: options.allowParticipantNames,
    limit: options.limit,
  });
}
