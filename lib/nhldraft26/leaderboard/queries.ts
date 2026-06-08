import type { SupabaseClient } from "@supabase/supabase-js";

export type NhlDraft26PublicEntrySummary = {
  entryId: string;
  displayName: string;
  updatedAt: string;
};

export type NhlDraft26PublicPickRow = {
  entryId: string;
  pickNumber: number;
  prospectId: string;
};

export type NhlDraft26PublicLeaderboardData = {
  entries: NhlDraft26PublicEntrySummary[];
  picks: NhlDraft26PublicPickRow[];
};

type PublicEntryRpcRow = {
  entry_id: string;
  display_name: string;
  updated_at: string;
};

type PublicPickRpcRow = {
  entry_id: string;
  pick_number: number;
  prospect_id: string;
};

export async function fetchNhlDraft26PublicLeaderboardData(
  supabase: SupabaseClient,
): Promise<{ data: NhlDraft26PublicLeaderboardData; error: string | null }> {
  const [entriesResult, picksResult] = await Promise.all([
    supabase.rpc("fetch_nhl_draft26_public_entries"),
    supabase.rpc("fetch_nhl_draft26_public_picks"),
  ]);

  if (entriesResult.error) {
    return {
      data: { entries: [], picks: [] },
      error: entriesResult.error.message,
    };
  }
  if (picksResult.error) {
    return {
      data: { entries: [], picks: [] },
      error: picksResult.error.message,
    };
  }

  const entries = ((entriesResult.data ?? []) as PublicEntryRpcRow[]).map((row) => ({
    entryId: row.entry_id,
    displayName: row.display_name,
    updatedAt: row.updated_at,
  }));

  const picks = ((picksResult.data ?? []) as PublicPickRpcRow[]).map((row) => ({
    entryId: row.entry_id,
    pickNumber: row.pick_number,
    prospectId: row.prospect_id,
  }));

  return { data: { entries, picks }, error: null };
}

export function hasNhlDraft26PublishedResults(): boolean {
  // When draft results are stored, flip leaderboard to standings mode.
  return false;
}
