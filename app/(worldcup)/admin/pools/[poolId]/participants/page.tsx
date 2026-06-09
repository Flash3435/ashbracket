import { IncompleteBracketsPanel } from "@/components/admin/IncompleteBracketsPanel";
import { ParticipantsManager } from "@/components/admin/ParticipantsManager";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  deriveParticipantPicksStatus,
  type ParticipantWithPicksStatus,
} from "@/lib/admin/participantPickStatus";
import { getSimulationPoolEmailUiStatus } from "@/lib/admin/simulationPoolEmailPolicy";
import { loadIncompleteBracketPanelForPool } from "@/lib/admin/loadIncompleteBracketPanelForPool";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { buildCompletionDiagnosticRows } from "@/lib/communications/picksCompleteness";
import { loadAdminPicksCompletenessInputsForPool } from "@/lib/admin/trustedPoolPicksCompleteness";
import { formatPoolLockSummary } from "@/lib/communications/messageTemplates";
import { poolShareJoinUrl } from "@/lib/site-url";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "@/lib/participants/participantsDb";
import { PoolPotAdminSummary } from "@/components/pools/PoolPotAdminSummary";
import { mapPoolPaymentFromPool, poolIsPaid } from "@/lib/pools/poolPayment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPoolParticipantsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase, pool } = await requireManagedPool(poolId);
  const simulationEmailStatus = getSimulationPoolEmailUiStatus(
    Boolean(pool.is_simulation),
  );
  const incompleteBracketPanel = await loadIncompleteBracketPanelForPool(
    supabase,
    {
      poolId,
      poolName: pool.name?.trim() || "Your pool",
      lockAtIso: pool.lock_at ?? null,
    },
  );
  const jc = pool.join_code?.trim() ?? null;
  const shareUrl = jc ? poolShareJoinUrl(jc) : null;
  const lockAtIso = pool.lock_at ?? null;
  const lockSummary = formatPoolLockSummary(lockAtIso);
  const picksLocked =
    typeof lockAtIso === "string" &&
    Number.isFinite(new Date(lockAtIso).getTime()) &&
    new Date(lockAtIso).getTime() <= Date.now();
  const poolPayment = mapPoolPaymentFromPool(pool);
  const poolIsPaidPool = poolIsPaid(poolPayment);

  let initialParticipants: ParticipantWithPicksStatus[] = [];
  let loadError: string | null = null;
  let picksStatusWarning: string | null = null;

  try {
    const { data, error } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .eq("pool_id", poolId)
      .order("display_name", { ascending: true });

    if (error) loadError = error.message;
    else {
      const participantRows = (data ?? []) as ParticipantRow[];
      const participants = participantRows.map((row) => mapParticipantRow(row));
      const participantIds = participantRows.map((row) => row.id);
      const picksStatusById = new Map<
        string,
        ParticipantWithPicksStatus["picksStatus"]
      >();

      if (participantIds.length > 0) {
        const completenessInputs = await loadAdminPicksCompletenessInputsForPool(
          poolId,
          participantIds,
          { fallbackSupabase: supabase },
        );

        if (!completenessInputs) {
          picksStatusWarning =
            "Picks status is unavailable right now. Participant records still load, but completion filters and reminder shortcuts are hidden until the status check succeeds.";
        } else {
          const diagnostics = buildCompletionDiagnosticRows(
            completenessInputs,
            poolId,
            participantRows.map((row) => ({
              id: row.id,
              display_name: row.display_name,
            })),
          );
          const diagnosticById = new Map(
            diagnostics.map((row) => [row.participant_id, row]),
          );
          const lastSavedAtById = new Map<string, string>();

          for (const prediction of completenessInputs.predictions) {
            const existing = lastSavedAtById.get(prediction.participantId);
            if (
              !existing ||
              new Date(prediction.updatedAt).getTime() >
                new Date(existing).getTime()
            ) {
              lastSavedAtById.set(prediction.participantId, prediction.updatedAt);
            }
          }

          for (const participant of participants) {
            const diagnostic = diagnosticById.get(participant.id);
            if (!diagnostic) continue;
            picksStatusById.set(
              participant.id,
              deriveParticipantPicksStatus({
                inviteStatus: participant.inviteStatus,
                diagnostic,
                lastSavedAt: lastSavedAtById.get(participant.id) ?? null,
              }),
            );
          }
        }
      }

      initialParticipants = participants.map((participant) => ({
        ...participant,
        picksStatus: picksStatusById.get(participant.id) ?? null,
      }));
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load participants.";
  }

  return (
    <PageContainer>
      <PageTitle
        title="Participants"
        description="Invite by email, share an open join link with your group, or add names manually for your records. Changes apply right away."
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      {picksStatusWarning ? (
        <p className="mb-4 rounded-md border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {picksStatusWarning}
        </p>
      ) : null}
      {poolIsPaidPool && !loadError ? (
        <div className="mb-6">
          <PoolPotAdminSummary
            poolPayment={poolPayment}
            participants={initialParticipants}
          />
        </div>
      ) : null}
      {!loadError ? (
        <IncompleteBracketsPanel
          data={incompleteBracketPanel}
          simulationEmailStatus={simulationEmailStatus}
          showPoolName={false}
          className="mb-6"
        />
      ) : null}
      <ParticipantsManager
        poolId={poolId}
        initialParticipants={initialParticipants}
        joinCode={jc}
        shareUrl={shareUrl}
        disabled={Boolean(loadError)}
        incompletePicksMessageHref={`/admin/pools/${poolId}/communications?preset=incomplete_picks`}
        picksLocked={picksLocked}
        picksStatusAvailable={!picksStatusWarning}
        lockSummary={lockSummary}
        simulationEmailStatus={simulationEmailStatus}
        poolIsPaid={poolIsPaidPool}
      />
    </PageContainer>
  );
}
