"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { fetchOfficialLiveEdition } from "@/lib/tournament/editionScope";
import { buildMatchScoreUpdate } from "@/lib/tournament/matchGoals/buildMatchScoreUpdate";
import { validateMatchGoalPayload } from "@/lib/tournament/matchGoals/validateMatchGoalPayload";
import { revalidatePath } from "next/cache";

export type MatchGoalsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

function revalidateMatchGoalsPaths(): void {
  revalidatePath("/admin/tournament/match-goals");
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/status");
}

async function requireGlobalAdminMatchGoals(): Promise<
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
      error: "Only global administrators can edit match scores and goals.",
    };
  }

  const liveEdition = await fetchOfficialLiveEdition(supabase);
  if (!liveEdition) {
    return { ok: false, error: "Official live tournament edition is not installed." };
  }
  if (liveEdition.isSimulation) {
    return {
      ok: false,
      error: "Official edition is marked simulation — refusing live match goal edits.",
    };
  }

  return { ok: true, supabase, editionId: liveEdition.id };
}

async function loadMatchForEdition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  editionId: string,
  matchId: string,
): Promise<
  | {
      ok: true;
      row: {
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
    }
  | { ok: false; error: string }
> {
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
  return { ok: true, row: data };
}

export async function saveMatchScoreAction(input: {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
}): Promise<MatchGoalsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchGoals();
    if (!gate.ok) return gate;

    const loaded = await loadMatchForEdition(gate.supabase, gate.editionId, input.matchId);
    if (!loaded.ok) return loaded;

    if (loaded.row.sync_locked) {
      return {
        ok: false,
        error: "This match is sync locked. Unlock it before editing the score manually.",
      };
    }

    const built = buildMatchScoreUpdate({
      homeTeamId: loaded.row.home_team_id,
      awayTeamId: loaded.row.away_team_id,
      homeGoals: input.homeGoals,
      awayGoals: input.awayGoals,
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

    revalidateMatchGoalsPaths();
    return {
      ok: true,
      message:
        "Score saved. Run Update standings to recompute results and leaderboards.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function clearMatchScoreAction(input: {
  matchId: string;
}): Promise<MatchGoalsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchGoals();
    if (!gate.ok) return gate;

    const loaded = await loadMatchForEdition(gate.supabase, gate.editionId, input.matchId);
    if (!loaded.ok) return loaded;

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

    revalidateMatchGoalsPaths();
    return {
      ok: true,
      message:
        "Score cleared. Run Update standings if you need to rebuild derived results.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function saveMatchGoalAction(input: {
  matchId: string;
  goalId?: string | null;
  playerName: string;
  teamId: string | null;
  minute: number | null;
  stoppageMinute: number | null;
  isOwnGoal: boolean;
}): Promise<MatchGoalsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchGoals();
    if (!gate.ok) return gate;

    const loaded = await loadMatchForEdition(gate.supabase, gate.editionId, input.matchId);
    if (!loaded.ok) return loaded;

    const validated = validateMatchGoalPayload({
      playerName: input.playerName,
      teamId: input.teamId,
      minute: input.minute,
      stoppageMinute: input.stoppageMinute,
      isOwnGoal: input.isOwnGoal,
    });
    if (!validated.ok) return validated;

    const row = {
      edition_id: gate.editionId,
      match_id: input.matchId,
      team_id: validated.value.teamId,
      player_name: validated.value.playerName,
      minute: validated.value.minute,
      stoppage_minute: validated.value.stoppageMinute,
      is_own_goal: validated.value.isOwnGoal,
    };

    const goalId = input.goalId?.trim() || null;
    if (goalId) {
      const { error } = await gate.supabase
        .from("tournament_match_goals")
        .update(row)
        .eq("id", goalId)
        .eq("edition_id", gate.editionId)
        .eq("match_id", input.matchId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await gate.supabase.from("tournament_match_goals").insert(row);
      if (error) return { ok: false, error: error.message };
    }

    revalidateMatchGoalsPaths();
    return {
      ok: true,
      message:
        "Goal saved. Score unchanged — run Update standings after you save final scores.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function deleteMatchGoalAction(input: {
  matchId: string;
  goalId: string;
}): Promise<MatchGoalsActionResult> {
  try {
    const gate = await requireGlobalAdminMatchGoals();
    if (!gate.ok) return gate;

    const { error } = await gate.supabase
      .from("tournament_match_goals")
      .delete()
      .eq("id", input.goalId)
      .eq("match_id", input.matchId)
      .eq("edition_id", gate.editionId);

    if (error) return { ok: false, error: error.message };

    revalidateMatchGoalsPaths();
    return {
      ok: true,
      message: "Goal deleted. Match score and standings were not changed.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
