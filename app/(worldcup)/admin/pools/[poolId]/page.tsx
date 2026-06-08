import { IncompleteBracketsOverview } from "@/components/admin/IncompleteBracketsOverview";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "@/lib/communications/picksCompleteness";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPoolDashboardPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase } = await requireManagedPool(poolId);

  const base = `/admin/pools/${poolId}`;

  let participantRows: Array<{
    id: string;
    display_name: string | null;
    user_id: string | null;
  }> = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("participants")
      .select("id, display_name, user_id")
      .eq("pool_id", poolId)
      .order("display_name", { ascending: true });
    if (error) loadError = error.message;
    else participantRows = data ?? [];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load participants.";
  }

  const participantIds = participantRows.map((r) => r.id);
  const inputs = loadError
    ? null
    : await loadPicksCompletenessInputsForPool(
        supabase,
        poolId,
        participantIds,
      );

  const incomplete =
    inputs && !loadError
      ? participantRows
          .map((row) => {
            const completion = buildCompletionStatusForParticipant(
              inputs,
              row.id,
            );
            return {
              participantId: row.id,
              displayName:
                String(row.display_name ?? "").trim() || "Unnamed participant",
              userId: row.user_id,
              completion,
            };
          })
          .filter((row) => !row.completion.isComplete)
      : [];

  const completeCount =
    inputs && !loadError
      ? participantRows.filter((row) =>
          buildCompletionStatusForParticipant(inputs, row.id).isComplete,
        ).length
      : 0;

  return (
    <PageContainer>
      <PageTitle
        title="Pool dashboard"
        description="Overview, settings, participants, picks, payments, and email for this pool."
      />

      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : inputs ? (
        <div className="mb-8">
          <IncompleteBracketsOverview
            completeCount={completeCount}
            participantCount={participantRows.length}
            knockoutBracketPicksUnlocked={inputs.knockoutBracketPicksUnlocked}
            incomplete={incomplete}
          />
        </div>
      ) : null}

      <ul className="list-inside list-disc space-y-2 text-sm text-ash-muted">
        <li>
          <Link href={`${base}/settings`} className="ash-link">
            Pool settings
          </Link>
          <span> — name, public leaderboard, lock time.</span>
        </li>
        <li>
          <Link href={`${base}/participants`} className="ash-link">
            Participants
          </Link>
          <span> — invites, manual rows, payment flags.</span>
        </li>
        <li>
          <Link href={`${base}/picks`} className="ash-link">
            Participant picks
          </Link>
          <span> — edit brackets for any member.</span>
        </li>
        <li>
          <Link href={`${base}/payments`} className="ash-link">
            Payments
          </Link>
          <span> — overview of who paid.</span>
        </li>
        <li>
          <Link href={`${base}/communications`} className="ash-link">
            Email participants
          </Link>
          <span> — reminders and custom messages.</span>
        </li>
        <li>
          <Link href={`${base}/standings`} className="ash-link">
            Standings / recalculate
          </Link>
          <span> — re-score this pool from results and rules.</span>
        </li>
      </ul>
    </PageContainer>
  );
}
