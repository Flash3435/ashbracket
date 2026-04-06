import { ParticipantsManager } from "@/components/admin/ParticipantsManager";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";
import type { Participant } from "../../../types/participant";

/** Dynamic page: loads current participants on each request. */
export const dynamic = "force-dynamic";

export default async function AdminParticipantsPage() {
  let initialParticipants: Participant[] = [];
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("participants")
      .select(
        "id, pool_id, display_name, email, is_paid, paid_at, user_id, invite_pending, invite_last_sent_at",
      )
      .eq("pool_id", SAMPLE_POOL_ID)
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
        description="Invite people by email (they get a private link), or add names manually for your own records. Changes apply right away."
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      <ParticipantsManager
        initialParticipants={initialParticipants}
        disabled={Boolean(loadError)}
      />
    </PageContainer>
  );
}
