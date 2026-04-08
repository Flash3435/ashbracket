import { ParticipantsManager } from "@/components/admin/ParticipantsManager";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { poolShareJoinUrl } from "@/lib/site-url";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "@/lib/participants/participantsDb";
import type { Participant } from "../../../../../types/participant";

export const dynamic = "force-dynamic";

export default async function AdminPoolParticipantsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase, pool } = await requireManagedPool(poolId);
  const jc = pool.join_code?.trim() ?? null;
  const shareUrl = jc ? poolShareJoinUrl(jc) : null;

  let initialParticipants: Participant[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .eq("pool_id", poolId)
      .order("display_name", { ascending: true });

    if (error) loadError = error.message;
    else
      initialParticipants = (data ?? []).map((row) =>
        mapParticipantRow(row as ParticipantRow),
      );
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
      <ParticipantsManager
        poolId={poolId}
        initialParticipants={initialParticipants}
        joinCode={jc}
        shareUrl={shareUrl}
        disabled={Boolean(loadError)}
      />
    </PageContainer>
  );
}
