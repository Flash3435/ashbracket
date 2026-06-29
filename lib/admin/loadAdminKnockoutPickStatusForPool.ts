import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import {
  buildAdminKnockoutPickStatusPanelData,
  type AdminKnockoutPickStatusPanelData,
} from "./adminKnockoutPickStatus";
import { loadAdminPicksCompletenessInputsForPool } from "./trustedPoolPicksCompleteness";
import { fetchPublicTournamentProgress } from "../tournament/fetchPublicTournamentProgress";

export async function loadAdminKnockoutPickStatusForPool(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    poolName: string;
  },
): Promise<AdminKnockoutPickStatusPanelData> {
  noStore();

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", args.poolId)
    .order("display_name", { ascending: true });

  if (error) {
    return buildAdminKnockoutPickStatusPanelData({
      poolId: args.poolId,
      poolName: args.poolName,
      participants: [],
      slotsByParticipantId: new Map(),
      teams: [],
      tournamentMatches: null,
      officialRoundOf32Complete: true,
      statusAvailable: false,
      statusUnavailableReason: "Could not load participants for knockout pick status.",
    });
  }

  const participantRows = (rows ?? []) as { id: string; display_name: string }[];
  const participantIds = participantRows.map((r) => r.id);

  const [loaded, tournamentProgress] = await Promise.all([
    participantIds.length > 0
      ? loadAdminPicksCompletenessInputsForPool(args.poolId, participantIds, {
          fallbackSupabase: supabase,
        })
      : Promise.resolve(null),
    fetchPublicTournamentProgress(),
  ]);

  const tournamentMatches = tournamentProgress.data?.matches ?? null;

  if (!loaded || !loaded.ok) {
    return buildAdminKnockoutPickStatusPanelData({
      poolId: args.poolId,
      poolName: args.poolName,
      participants: participantRows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
      })),
      slotsByParticipantId: new Map(),
      teams: [],
      tournamentMatches,
      officialRoundOf32Complete: true,
      statusAvailable: false,
      statusUnavailableReason:
        loaded?.diagnostics.warningMessage ??
        "Knockout pick status is unavailable right now.",
    });
  }

  const { inputs } = loaded;
  const slotsByParticipantId = new Map<string, ReturnType<typeof buildAllParticipantPickDrafts>>();

  for (const pid of participantIds) {
    slotsByParticipantId.set(
      pid,
      buildAllParticipantPickDrafts({
        stageByCode: inputs.stageByCode,
        predictions: inputs.predictions,
        participantId: pid,
        bonusKeys: inputs.bonusKeys,
        teams: inputs.teams,
        groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
      }),
    );
  }

  return buildAdminKnockoutPickStatusPanelData({
    poolId: args.poolId,
    poolName: args.poolName,
    participants: participantRows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
    })),
    slotsByParticipantId,
    teams: inputs.teams,
    tournamentMatches,
    officialRoundOf32Complete: inputs.knockoutBracketPicksUnlocked,
  });
}
