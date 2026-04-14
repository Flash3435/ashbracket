import { AdminParticipantPicker } from "@/components/admin/AdminParticipantPicker";
import { ParticipantKnockoutPicksForm } from "@/components/admin/ParticipantKnockoutPicksForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { ACCOUNT_TOURNAMENT_STAGE_CODES } from "../../../../../lib/account/loadAccountKnockoutSelection";
import {
  buildAllParticipantPickDrafts,
  participantBonusKeysForPool,
} from "../../../../../lib/predictions/buildParticipantPickDrafts";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "../../../../../lib/participants/participantsDb";
import {
  mapTeamRow,
  mapTournamentStageRow,
} from "../../../../../lib/results/mapRows";
import { fetchGroupTeamCountryCodesByLetter } from "../../../../../lib/tournament/fetchGroupTeamCountryCodesByLetter";
import { TEAM_TABLE_SELECT } from "../../../../../lib/teams/teamDbSelect";
import { mapPredictionRow } from "../../../../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../../../../src/types/domain";
import type { Participant } from "../../../../../types/participant";
import Link from "next/link";
import { saveParticipantKnockoutPicksForPoolAction } from "../../../picks/actions";
import type { KnockoutPickSlotDraft } from "../../../../../types/adminKnockoutPicks";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = [...ACCOUNT_TOURNAMENT_STAGE_CODES];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Defensive logging for production diagnosis (Vercel / server logs). */
function logAdminPicks(event: string, payload: Record<string, unknown>) {
  try {
    console.warn(`[admin/picks] ${event}`, JSON.stringify(payload));
  } catch {
    console.warn(`[admin/picks] ${event}`, payload);
  }
}

type PageProps = {
  params: Promise<{ poolId: string }>;
  searchParams?: Promise<{ participant?: string }>;
};

export default async function AdminPoolPicksPage({ params, searchParams }: PageProps) {
  const { poolId } = await params;
  const { supabase } = await requireManagedPool(poolId);

  const sp = searchParams != null ? await searchParams : {};
  const participantParam =
    typeof sp.participant === "string" ? sp.participant.trim() : "";
  const selectedId =
    participantParam && UUID_RE.test(participantParam)
      ? participantParam
      : null;

  let participants: Participant[] = [];
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let predictions: Prediction[] = [];
  let bonusKeysOrdered: string[] = participantBonusKeysForPool([]);
  let groupTeamCountryCodesByLetter: Record<string, string[]> = {};
  let loadError: string | null = null;
  let selectedParticipant: Participant | null = null;
  let initialSlots: KnockoutPickSlotDraft[] = [];

  try {
    const [participantsRes, teamsRes, stagesRes, groupCodes] = await Promise.all([
      supabase
        .from("participants")
        .select(
          "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
        )
        .eq("pool_id", poolId)
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
        .in("code", STAGE_CODES_NEEDED)
        .order("sort_order", { ascending: true }),
      fetchGroupTeamCountryCodesByLetter(supabase),
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
      groupTeamCountryCodesByLetter = groupCodes;
    }

    if (!loadError) {
      for (const code of STAGE_CODES_NEEDED) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `A required tournament stage (“${code}”) is missing. Ask your site host to finish tournament setup.`;
          break;
        }
      }
    }

    if (!loadError && selectedId) {
      selectedParticipant =
        participants.find((p) => p.id === selectedId) ?? null;

      if (!selectedParticipant) {
        loadError =
          "That participant is not in this pool. Choose someone from the list or clear the link.";
        logAdminPicks("participant_not_in_pool", {
          poolId,
          participantId: selectedId,
          participantInPool: false,
          poolParticipantCount: participants.length,
        });
      } else {
        const [{ data: predData, error: predErr }, { data: ruleRows, error: ruleErr }] =
          await Promise.all([
            supabase
              .from("predictions")
              .select(
                "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
              )
              .eq("pool_id", poolId)
              .eq("participant_id", selectedId),
            supabase
              .from("scoring_rules")
              .select("bonus_key")
              .eq("pool_id", poolId)
              .eq("prediction_kind", "bonus_pick")
              .order("bonus_key", { ascending: true }),
          ]);

        if (predErr) {
          console.error("[admin/picks] predictions query error", {
            poolId,
            participantId: selectedId,
            message: predErr.message,
            code: predErr.code,
          });
          loadError =
            "We couldn't load picks for this participant. Please try again.";
        } else if (ruleErr) {
          console.error("[admin/picks] scoring_rules query error", {
            poolId,
            participantId: selectedId,
            message: ruleErr.message,
            code: ruleErr.code,
          });
          loadError =
            "We couldn't load picks for this participant. Please try again.";
        } else {
          type PredRow = Parameters<typeof mapPredictionRow>[0];
          const rawPreds = predData ?? [];
          predictions = [];
          for (const row of rawPreds) {
            if (!row || typeof row !== "object") continue;
            try {
              predictions.push(mapPredictionRow(row as PredRow));
            } catch (mapErr) {
              console.error("[admin/picks] skip malformed prediction row", {
                poolId,
                participantId: selectedId,
                rowId: (row as { id?: string }).id,
                message:
                  mapErr instanceof Error ? mapErr.message : String(mapErr),
              });
            }
          }
          const fromDb = (ruleRows ?? [])
            .map((r) => r.bonus_key as string | null)
            .filter((k): k is string => Boolean(k && k.trim()));
          bonusKeysOrdered = participantBonusKeysForPool(fromDb);
          logAdminPicks("predictions_loaded", {
            poolId,
            participantId: selectedId,
            participantInPool: true,
            rawPredictionRows: rawPreds.length,
            mappedPredictions: predictions.length,
            bonusRuleRows: (ruleRows ?? []).length,
          });
        }
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load participant picks.";
    console.error("[admin/picks] unexpected loader error", {
      poolId,
      participantId: selectedId,
      message,
    });
    loadError = message;
  }

  if (selectedParticipant && !loadError) {
    const stageByCode = Object.fromEntries(
      stages.map((s) => [s.code, s]),
    ) as Partial<Record<TournamentStage["code"], TournamentStage>>;
    try {
      initialSlots = buildAllParticipantPickDrafts({
        stageByCode,
        predictions,
        participantId: selectedParticipant.id,
        bonusKeys: bonusKeysOrdered,
      });
    } catch (slotErr) {
      const message =
        slotErr instanceof Error ? slotErr.message : String(slotErr);
      console.error("[admin/picks] buildAllParticipantPickDrafts failed", {
        poolId,
        participantId: selectedParticipant.id,
        message,
        predictionsCount: predictions.length,
        stageCodes: stages.map((s) => s.code),
      });
      loadError =
        "We couldn't load picks for this participant. Try again, or contact support if this continues.";
      initialSlots = [];
    }
  }

  if (selectedId) {
    logAdminPicks("request_snapshot", {
      poolId,
      participantId: selectedId,
      participantResolved: Boolean(selectedParticipant),
      loadError,
      predictionsCount: predictions.length,
      initialSlotCount: initialSlots.length,
    });
  }

  const invalidQuery =
    Boolean(participantParam) && !UUID_RE.test(participantParam);

  const pickerSelectedId =
    selectedId && participants.some((p) => p.id === selectedId)
      ? selectedId
      : "";

  const picksBase = `/admin/pools/${poolId}/picks`;

  return (
    <PageContainer>
      <PageTitle
        title="Participant picks"
        description="Edit any participant’s full path: Stage 1 group finishes, Stage 2 best third-place advancers, Stage 3 knockout (Round of 32 through champion) when published, and bonus picks."
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
          That participant link is not valid. Choose someone from the list
          above.
        </p>
      ) : null}

      {invalidQuery || (selectedId && loadError) ? (
        <p className="mb-6 text-sm">
          <Link href={picksBase} className="ash-link">
            Clear selection and return to the pool picks page
          </Link>
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
              basePath={picksBase}
            />
          </div>

          {!selectedId ? (
            <p className="text-sm text-ash-muted">
              Select a participant to load their picks.
            </p>
          ) : null}

          {selectedId && selectedParticipant && !loadError ? (
            <>
              {predictions.length === 0 ? (
                <p className="mb-6 rounded-md border border-ash-border bg-ash-surface px-3 py-2 text-sm text-ash-muted">
                  This participant has not made any picks yet. Every slot
                  starts empty until you save.
                </p>
              ) : null}
              <ParticipantKnockoutPicksForm
                participantId={selectedParticipant.id}
                participantDisplayName={selectedParticipant.displayName}
                initialSlots={initialSlots}
                teams={teams}
                groupTeamCountryCodesByLetter={groupTeamCountryCodesByLetter}
                disabled={teams.length === 0}
                savePicks={saveParticipantKnockoutPicksForPoolAction.bind(
                  null,
                  poolId,
                )}
              />
              {teams.length === 0 ? (
                <p className="mt-4 text-sm text-amber-200">
                  No teams are available yet. Ask your site host to load the
                  team list before you assign picks.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
