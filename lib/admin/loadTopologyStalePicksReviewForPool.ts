import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import {
  loadActiveWorldCupPoolIds,
  loadTopologyScanContext,
  scanKnockoutTopologyStalePicksForPool,
  summarizeTopologyScanResults,
} from "../bracket/scanKnockoutTopologyStalePicks";

export type TopologyStalePicksReviewParticipant = {
  participantId: string;
  displayName: string;
  email: string | null;
  stalePickCount: number;
  missingPickCount: number;
  staleSlots: string[];
  missingSlots: string[];
};

export type TopologyStalePicksReviewPanelData = {
  poolId: string;
  poolName: string;
  statusAvailable: boolean;
  participantsScanned: number;
  participantsWithStalePicks: number;
  participantsWithMissingOnly: number;
  plannedRepairClears: number;
  participants: TopologyStalePicksReviewParticipant[];
};

const MAX_VISIBLE = 12;

export async function loadTopologyStalePicksReviewForPool(
  supabase: SupabaseClient,
  args: { poolId: string; poolName: string },
): Promise<TopologyStalePicksReviewPanelData> {
  noStore();

  try {
    const pools = await loadActiveWorldCupPoolIds(supabase, args.poolId);
    const pool = pools[0];
    if (!pool) {
      return emptyPanel(args, false);
    }

    const scanContext = await loadTopologyScanContext(supabase);
    const scan = await scanKnockoutTopologyStalePicksForPool(supabase, {
      pool,
      ...scanContext,
    });
    const totals = summarizeTopologyScanResults([scan]);

    const participants = scan.participants
      .map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName.trim() || "Participant",
        email: p.email,
        stalePickCount: p.audit.stalePicks.length,
        missingPickCount: p.audit.missingPicks.length,
        staleSlots: p.audit.stalePicks.map((s) => s.slot),
        missingSlots: p.audit.missingPicks.map((m) => m.slot),
      }))
      .sort((a, b) => b.stalePickCount - a.stalePickCount)
      .slice(0, MAX_VISIBLE);

    return {
      poolId: args.poolId,
      poolName: args.poolName,
      statusAvailable: true,
      participantsScanned: scan.participantsScanned,
      participantsWithStalePicks: totals.participantsWithStalePicks,
      participantsWithMissingOnly: totals.participantsWithOnlyMissingDownstream,
      plannedRepairClears: totals.plannedClears,
      participants,
    };
  } catch {
    return emptyPanel(args, false);
  }
}

function emptyPanel(
  args: { poolId: string; poolName: string },
  statusAvailable: boolean,
): TopologyStalePicksReviewPanelData {
  return {
    poolId: args.poolId,
    poolName: args.poolName,
    statusAvailable,
    participantsScanned: 0,
    participantsWithStalePicks: 0,
    participantsWithMissingOnly: 0,
    plannedRepairClears: 0,
    participants: [],
  };
}
