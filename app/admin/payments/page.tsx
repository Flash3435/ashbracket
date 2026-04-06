import { PaymentsOverview } from "@/components/admin/PaymentsOverview";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  mapParticipantPaymentRow,
  type ParticipantPaymentView,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  let loadError: string | null = null;
  let rows: ParticipantPaymentView[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("participants")
      .select("id, pool_id, display_name, email, is_paid, paid_at")
      .eq("pool_id", SAMPLE_POOL_ID)
      .order("display_name", { ascending: true });

    if (error) loadError = error.message;
    else rows = (data ?? []).map((r) => mapParticipantPaymentRow(r as ParticipantRow));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load participants.";
  }

  return (
    <PageContainer>
      <PageTitle
        title="Payments"
        description="See who has paid and when. To mark someone paid or unpaid, edit them on the Participants page."
      />
      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      {!loadError ? <PaymentsOverview rows={rows} /> : null}
    </PageContainer>
  );
}
