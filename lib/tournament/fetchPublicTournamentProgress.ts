import { createClient } from "@/lib/supabase/server";
import { OFFICIAL_EDITION_CODE } from "../config/officialTournament";
import type {
  PublicTournamentProgressPayload,
  TournamentEditionPublicRow,
  TournamentMatchPublicRow,
} from "../../types/tournamentPublic";

/**
 * Loads official edition + match rows via public Supabase views (safe columns only).
 */
export async function fetchPublicTournamentProgress(): Promise<{
  data: PublicTournamentProgressPayload | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const [edRes, mRes] = await Promise.all([
      supabase
        .from("tournament_editions_public")
        .select("id, code, name, starts_on, ends_on")
        .eq("code", OFFICIAL_EDITION_CODE)
        .maybeSingle(),
      supabase
        .from("tournament_public_matches")
        .select(
          [
            "match_id",
            "edition_id",
            "edition_code",
            "match_code",
            "stage_code",
            "stage_label",
            "stage_sort_order",
            "group_code",
            "round_index",
            "kickoff_at",
            "status",
            "home_goals",
            "away_goals",
            "home_penalties",
            "away_penalties",
            "home_team_name",
            "home_country_code",
            "away_team_name",
            "away_country_code",
            "winner_team_name",
            "winner_country_code",
          ].join(", "),
        )
        .eq("edition_code", OFFICIAL_EDITION_CODE)
        .order("stage_sort_order", { ascending: true })
        .order("group_code", { ascending: true, nullsFirst: false })
        .order("round_index", { ascending: true })
        .order("kickoff_at", { ascending: true, nullsFirst: true })
        .order("match_code", { ascending: true }),
    ]);

    const errMsg = edRes.error?.message ?? mRes.error?.message ?? null;
    if (errMsg) {
      return { data: null, error: errMsg };
    }

    const edition = (edRes.data ?? null) as unknown as TournamentEditionPublicRow | null;
    const matches = (mRes.data ?? []) as unknown as TournamentMatchPublicRow[];

    return {
      data: { edition, matches },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { data: null, error: message };
  }
}
