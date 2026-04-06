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

/** Always load fresh rows from Supabase (not at build time). */
export const dynamic = "force-dynamic";

export default async function AdminParticipantsPage() {
  let initialParticipants: Participant[] = [];
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, email, is_paid, paid_at")
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
        description="Manage who is in the pool. Changes are saved to Supabase for the configured sample pool."
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
