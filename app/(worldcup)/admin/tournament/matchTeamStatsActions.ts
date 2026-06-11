"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { fetchOfficialLiveEdition } from "@/lib/tournament/editionScope";
import { buildMatchScoreUpdate } from "@/lib/tournament/matchGoals/buildMatchScoreUpdate";
import {
  buildTeamStatUpsertRows,
  teamStatsAreEmpty,
} from "@/lib/tournament/matchTeamStats/buildTeamStatUpsertRows";
import {
  assertTeamIdsBelongToMatch,
  validateMatchTeamStatsPayload,
} from "@/lib/tournament/matchTeamStats/validateMatchTeamStatsPayload";
import { revalidatePath } from "next/cache";

export type MatchTeamStatsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

function revalidateMatchTeamStatsPaths(): void {
  revalidatePath("/admin/tournament/match-stats");
  revalidatePath("/admin/tournament/match-goals");
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/status");
  revalidatePath("/admin/tournament/live-scores");
}

async function requireGlobalAdminMatchStats(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; editionId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return {
      ok: false,
      error: "Only global administrators can edit match scores and team stats.",
    };
  }

  const liveEdition = await fetchOfficialLiveEdition(supabase);
  if (!liveEdition) {
    return { ok: false, error: "Official live tournament edition is not installed." };
  }
  if (liveEdition.isSimulation) {
    return {
      ok: false,
      error: "Official edition is marked simulation — refusing live match stat edits.",
    };
  }

  return { ok: true, supabase, editionId: liveEdition.id };
}

type MatchRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  status: string;
  sync_locked: boolean;
};

async function loadMatchForEdition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  editionId: string,
  matchId: string,
): Promise<{ ok: true; row: MatchRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, status, sync_locked",
    )
    .eq("edition_id", editionId)
    .eq("id", matchId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Match not found on the live edition." };
  return { ok: true, row: data as MatchRow };
}

/**
 * Save final score and per-team card totals for one match in one action.
 * Does not update predictions or points_ledger.
 */
export async function saveMatchTeamStatsAction(input: {
  matchId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
}): Promise<MatchTeamStatsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchStats();
    if (!gate.ok) return gate;

    const loaded = await loadMatchForEdition(gate.supabase, gate.editionId, input.matchId);
    if (!loaded.ok) return loaded;

    const teamsOk = assertTeamIdsBelongToMatch({
      homeTeamId: loaded.row.home_team_id,
      awayTeamId: loaded.row.away_team_id,
    });
    if (!teamsOk.ok) return teamsOk;

    const validated = validateMatchTeamStatsPayload(input);
    if (!validated.ok) return validated;

    const homeTeamId = loaded.row.home_team_id as string;
    const awayTeamId = loaded.row.away_team_id as string;

    const scoreChanged =
      validated.value.homeGoals !== loaded.row.home_goals ||
      validated.value.awayGoals !== loaded.row.away_goals;

    if (scoreChanged) {
      if (loaded.row.sync_locked) {
        return {
          ok: false,
          error: "This match is sync locked. Unlock it before editing the final score.",
        };
      }

      const built = buildMatchScoreUpdate({
        homeTeamId: loaded.row.home_team_id,
        awayTeamId: loaded.row.away_team_id,
        homeGoals: validated.value.homeGoals,
        awayGoals: validated.value.awayGoals,
        currentStatus: loaded.row.status,
        homePenalties: loaded.row.home_penalties,
        awayPenalties: loaded.row.away_penalties,
      });
      if (!built.ok) return built;

      const { error: scoreErr } = await gate.supabase
        .from("tournament_matches")
        .update(built.update)
        .eq("id", input.matchId)
        .eq("edition_id", gate.editionId);

      if (scoreErr) return { ok: false, error: scoreErr.message };
    } else if (
      (validated.value.homeGoals != null) !== (validated.value.awayGoals != null)
    ) {
      return {
        ok: false,
        error: "Enter both home and away scores, or leave both blank.",
      };
    }

    if (teamStatsAreEmpty(validated.value)) {
      const { error: delErr } = await gate.supabase
        .from("tournament_match_team_stats")
        .delete()
        .eq("edition_id", gate.editionId)
        .eq("match_id", input.matchId)
        .eq("source", "manual");
      if (delErr) return { ok: false, error: delErr.message };
    } else {
      const rows = buildTeamStatUpsertRows({
        editionId: gate.editionId,
        matchId: input.matchId,
        homeTeamId,
        awayTeamId,
        stats: validated.value,
      });

      const { error: statErr } = await gate.supabase
        .from("tournament_match_team_stats")
        .upsert(rows, { onConflict: "match_id,team_id,source" });

      if (statErr) return { ok: false, error: statErr.message };
    }

    revalidateMatchTeamStatsPaths();
    return {
      ok: true,
      message:
        "Match saved. Final score drives winners and standings — run Update standings to recompute. Team goals are derived from the final score; card totals are stored for bonus questions.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function clearMatchTeamStatsAction(input: {
  matchId: string;
  clearScore: boolean;
  clearCards: boolean;
}): Promise<MatchTeamStatsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchStats();
    if (!gate.ok) return gate;

    if (!input.clearScore && !input.clearCards) {
      return { ok: false, error: "Choose score and/or card totals to clear." };
    }

    const loaded = await loadMatchForEdition(gate.supabase, gate.editionId, input.matchId);
    if (!loaded.ok) return loaded;

    if (input.clearScore) {
      if (loaded.row.sync_locked) {
        return {
          ok: false,
          error: "This match is sync locked. Unlock it before clearing the score.",
        };
      }

      const built = buildMatchScoreUpdate({
        homeTeamId: loaded.row.home_team_id,
        awayTeamId: loaded.row.away_team_id,
        homeGoals: null,
        awayGoals: null,
        currentStatus: loaded.row.status,
        homePenalties: loaded.row.home_penalties,
        awayPenalties: loaded.row.away_penalties,
      });
      if (!built.ok) return built;

      const { error } = await gate.supabase
        .from("tournament_matches")
        .update(built.update)
        .eq("id", input.matchId)
        .eq("edition_id", gate.editionId);
      if (error) return { ok: false, error: error.message };
    }

    if (input.clearCards) {
      const { error } = await gate.supabase
        .from("tournament_match_team_stats")
        .delete()
        .eq("edition_id", gate.editionId)
        .eq("match_id", input.matchId)
        .eq("source", "manual");
      if (error) return { ok: false, error: error.message };
    }

    revalidateMatchTeamStatsPaths();
    const parts: string[] = [];
    if (input.clearScore) parts.push("Final score cleared.");
    if (input.clearCards) parts.push("Card totals cleared.");
    return {
      ok: true,
      message: `${parts.join(" ")} Run Update standings if you cleared a final score.`,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
