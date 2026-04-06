import { AdminParticipantPicker } from "@/components/admin/AdminParticipantPicker";
import { ParticipantKnockoutPicksForm } from "@/components/admin/ParticipantKnockoutPicksForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { saveParticipantKnockoutPicksAction } from "./actions";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import { buildKnockoutPickSlotDrafts } from "../../../lib/predictions/knockoutPickSlots";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";
import {
  mapTeamRow,
  mapTournamentStageRow,
} from "../../../lib/results/mapRows";
import { TEAM_TABLE_SELECT } from "../../../lib/teams/teamDbSelect";
import { mapPredictionRow } from "../../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../../src/types/domain";
import type { Participant } from "../../../types/participant";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = ["quarterfinal", "semifinal", "final"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AdminPicksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const participantParam = sp.participant?.trim() ?? "";
  const selectedId =
    participantParam && UUID_RE.test(participantParam)
      ? participantParam
      : null;

  let participants: Participant[] = [];
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let predictions: Prediction[] = [];
  let loadError: string | null = null;
  let selectedParticipant: Participant | null = null;

  try {
    const supabase = await createClient();

    const [participantsRes, teamsRes, stagesRes] = await Promise.all([
      supabase
        .from("participants")
        .select("id, pool_id, display_name, email, is_paid, paid_at")
        .eq("pool_id", SAMPLE_POOL_ID)
        .order("display_name", { ascending: true }),
      supabase
        .from("teams")
        .select(TEAM_TABLE_SELECT)
        .order("name", { ascending: true }),
      supabase
        .from("tournament_stages")
        .select(
          "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
        )
        .in("code", [...STAGE_CODES_NEEDED])
        .order("sort_order", { ascending: true }),
    ]);

    if (participantsRes.error) loadError = participantsRes.error.message;
    else if (teamsRes.error) loadError = teamsRes.error.message;
    else if (stagesRes.error) loadError = stagesRes.error.message;
    else {
      participants = (participantsRes.data ?? []).map((row) =>
        mapParticipantRow(row as ParticipantRow),
      );
      teams = (teamsRes.data ?? []).map(mapTeamRow);
      stages = (stagesRes.data ?? []).map(mapTournamentStageRow);
    }

    if (!loadError) {
      for (const code of STAGE_CODES_NEEDED) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `Missing tournament stage "${code}" in Supabase. Seed or migrate tournament_stages.`;
          break;
        }
      }
    }

    if (!loadError && selectedId) {
      selectedParticipant =
        participants.find((p) => p.id === selectedId) ?? null;

      if (!selectedParticipant) {
        loadError =
          "That participant is not in the sample pool, or the id is invalid.";
      } else {
        const { data: predData, error: predErr } = await supabase
          .from("predictions")
          .select(
            "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
          )
          .eq("pool_id", SAMPLE_POOL_ID)
          .eq("participant_id", selectedId)
          .in("prediction_kind", [
            "quarterfinalist",
            "semifinalist",
            "finalist",
            "champion",
          ]);

        if (predErr) loadError = predErr.message;
        else {
          type PredRow = Parameters<typeof mapPredictionRow>[0];
          predictions = (predData ?? []).map((row) =>
            mapPredictionRow(row as PredRow),
          );
        }
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load participant picks.";
  }

  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const initialSlots =
    selectedParticipant && !loadError
      ? buildKnockoutPickSlotDrafts(
          stageByCode,
          predictions,
          selectedParticipant.id,
        )
      : [];

  const invalidQuery =
    Boolean(participantParam) && !UUID_RE.test(participantParam);

  const pickerSelectedId =
    selectedId && participants.some((p) => p.id === selectedId)
      ? selectedId
      : "";

  return (
    <PageContainer>
      <PageTitle
        title="Participant picks"
        description="Edit knockout bracket picks (quarterfinal through champion) for anyone in the sample pool. Changes are written to predictions and standings are recomputed."
      />

      {loadError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {invalidQuery ? (
        <p
          className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          The participant query parameter is not a valid UUID.
        </p>
      ) : null}

      {!loadError && participants.length === 0 ? (
        <div className="ash-surface px-4 py-8 text-center">
          <p className="text-sm font-medium text-ash-text">
            No participants in this pool
          </p>
          <p className="mt-2 text-sm text-ash-muted">
            Add people on the Participants admin page before editing picks.
          </p>
        </div>
      ) : null}

      {!loadError && participants.length > 0 ? (
        <>
          <div className="mb-8">
            <AdminParticipantPicker
              participants={participants}
              selectedId={pickerSelectedId || null}
            />
          </div>

          {!selectedId ? (
            <p className="text-sm text-ash-muted">
              Select a participant to load their current predictions and edit
              knockout picks.
            </p>
          ) : null}

          {selectedId && selectedParticipant && !loadError ? (
            <>
              {predictions.length === 0 ? (
                <p className="mb-6 rounded-md border border-ash-border bg-ash-surface px-3 py-2 text-sm text-ash-muted">
                  No saved knockout picks yet for this participant — all slots
                  start empty.
                </p>
              ) : null}
              <ParticipantKnockoutPicksForm
                participantId={selectedParticipant.id}
                participantDisplayName={selectedParticipant.displayName}
                initialSlots={initialSlots}
                teams={teams}
                disabled={teams.length === 0}
                savePicks={saveParticipantKnockoutPicksAction}
              />
              {teams.length === 0 ? (
                <p className="mt-4 text-sm text-amber-200">
                  Add teams in Supabase (or run seed.sql) before you can assign
                  picks.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
