import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "@/lib/config/officialTournament";
import {
  isMissingSchemaObjectError,
  WC_LIVE_DAILY_UPDATE_STATUS_TABLE,
} from "@/lib/admin/missingSchemaObject";
import type { SyncOfficialTournamentSummary } from "./syncOfficialTournament";

export type LiveDailyUpdateStatusRow = {
  editionId: string;
  editionCode: string;
  lastSuccessAt: string;
  finishedMatchCount: number;
  derivedResultsCount: number;
  poolsRecalculated: number;
};

/** Time zone used when showing public “last updated” timestamps. */
export const PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE = "America/New_York";

/** Label shown on public pages for {@link PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE}. */
export const PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE_LABEL = "Eastern Time (US)";

export function formatPublicLiveScoresLastUpdated(iso: string | null | undefined): string | null {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE,
    }).format(d);
  } catch {
    return null;
  }
}

export function buildLiveDailyUpdateSuccessMessage(input: {
  summary: SyncOfficialTournamentSummary;
  editionName: string;
  editionCode: string;
  lastUpdatedAt: string;
}): string {
  const { summary, editionName, editionCode } = input;
  const lines: string[] = [];

  lines.push(
    `Live standings refreshed for edition “${editionName}” (${editionCode}).`,
  );
  lines.push(
    `Checked ${summary.matchCount} match${summary.matchCount === 1 ? "" : "es"}; ${summary.matchesWithScoresCount} with scores on file; ${summary.finishedMatchCount} marked finished; ${summary.derivedResultsInserted} derived result${summary.derivedResultsInserted === 1 ? "" : "s"} written; ${summary.poolsRecalculated} live pool${summary.poolsRecalculated === 1 ? "" : "s"} recalculated.`,
  );

  if (summary.matchCount === 0) {
    lines.push(
      "No matches are on file for this edition — install the official schedule before match day.",
    );
  } else if (summary.matchesWithScoresCount === 0) {
    lines.push(
      "No match scores are recorded yet — leaderboards were refreshed from current official results only.",
    );
  } else if (summary.finishedMatchCount === 0) {
    lines.push(
      "Scores exist but no matches are finished yet — group and knockout derived results may be unchanged.",
    );
  } else if (summary.derivedResultsInserted === 0) {
    lines.push(
      "No new derived results were written — existing official results are unchanged.",
    );
  }

  if (summary.syncLockedMatchCount > 0) {
    lines.push(
      `${summary.syncLockedMatchCount} match${summary.syncLockedMatchCount === 1 ? "" : "es"} frozen for sync (scores left as entered).`,
    );
  }

  if (summary.poolsRecalculated === 0) {
    lines.push(
      "No live pools are bound to this edition — official results were rebuilt but no pool ledgers were updated.",
    );
  }

  const formatted = formatPublicLiveScoresLastUpdated(input.lastUpdatedAt);
  if (formatted) {
    lines.push(`Last successful update: ${formatted}.`);
  }

  return lines.join(" ");
}

export async function recordLiveDailyUpdateStatus(
  supabase: SupabaseClient,
  editionId: string,
  summary: SyncOfficialTournamentSummary,
): Promise<{ ok: true; lastUpdatedAt: string } | { ok: false; error: string }> {
  const lastUpdatedAt = new Date().toISOString();
  const { error } = await supabase.from(WC_LIVE_DAILY_UPDATE_STATUS_TABLE).upsert(
    {
      edition_id: editionId,
      last_success_at: lastUpdatedAt,
      finished_match_count: summary.finishedMatchCount,
      derived_results_count: summary.derivedResultsInserted,
      pools_recalculated: summary.poolsRecalculated,
    },
    { onConflict: "edition_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, lastUpdatedAt };
}

export async function fetchLiveDailyUpdateStatusForEdition(
  supabase: SupabaseClient,
  editionId: string,
  editionCode: string = OFFICIAL_EDITION_CODE,
): Promise<LiveDailyUpdateStatusRow | null> {
  const { data, error } = await supabase
    .from(WC_LIVE_DAILY_UPDATE_STATUS_TABLE)
    .select(
      "edition_id, last_success_at, finished_match_count, derived_results_count, pools_recalculated",
    )
    .eq("edition_id", editionId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObjectError(error.message, WC_LIVE_DAILY_UPDATE_STATUS_TABLE)) {
      return null;
    }
    console.error("[liveDailyUpdateStatus] fetch failed", error.message);
    return null;
  }
  if (!data) return null;

  return {
    editionId: data.edition_id as string,
    editionCode,
    lastSuccessAt: data.last_success_at as string,
    finishedMatchCount: data.finished_match_count as number,
    derivedResultsCount: data.derived_results_count as number,
    poolsRecalculated: data.pools_recalculated as number,
  };
}

/** Public-safe: last update for the official live edition only. */
export async function fetchPublicLiveScoresLastUpdated(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("wc_live_daily_update_public")
    .select("last_success_at, edition_code")
    .eq("edition_code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObjectError(error.message, "wc_live_daily_update_public")) {
      return null;
    }
    console.error("[liveDailyUpdateStatus] public fetch failed", error.message);
    return null;
  }

  return (data?.last_success_at as string | undefined) ?? null;
}
