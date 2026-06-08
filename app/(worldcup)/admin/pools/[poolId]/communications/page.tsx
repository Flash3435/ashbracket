import { PoolCommunicationsForm } from "@/components/admin/PoolCommunicationsForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { loadParticipantIdsWithIncompletePicks } from "@/lib/communications/picksCompleteness";
import { formatPoolLockSummary } from "@/lib/communications/messageTemplates";
import type { PoolCommunicationParticipant } from "@/lib/communications/recipientResolve";

export const dynamic = "force-dynamic";

export default async function AdminPoolCommunicationsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase } = await requireManagedPool(poolId);

  let participants: PoolCommunicationParticipant[] = [];
  let poolName = "Your pool";
  let lockAtIso: string | null = null;
  let loadError: string | null = null;

  try {
    const [{ data: poolRow }, { data: rows, error: parErr }] = await Promise.all([
      supabase
        .from("pools")
        .select("name, lock_at")
        .eq("id", poolId)
        .maybeSingle(),
      supabase
        .from("participants")
        .select("id, display_name, email, is_paid")
        .eq("pool_id", poolId)
        .order("display_name", { ascending: true }),
    ]);

    if (parErr) loadError = parErr.message;
    else {
      poolName =
        (poolRow?.name as string | undefined)?.trim() || poolName;
      lockAtIso = (poolRow?.lock_at as string | null) ?? null;

      const list = (rows ?? []) as {
        id: string;
        display_name: string;
        email: string | null;
        is_paid: boolean;
      }[];

      const ids = list.map((r) => r.id);
      const incomplete = await loadParticipantIdsWithIncompletePicks(
        supabase,
        poolId,
        ids,
      );

      participants = list.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email ?? "",
        isPaid: r.is_paid,
        picksComplete: !incomplete.has(r.id),
      }));
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load pool participants.";
  }

  return (
    <PageContainer>
      <PageTitle
        title="Email participants"
        description="Send payment reminders, deadline reminders, or a custom note to groups of people in this pool. Each person only sees their own message."
      />

      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}

      <div className="mb-6 rounded-md border border-ash-border bg-ash-body/40 px-3 py-2 text-sm text-ash-muted">
        <p>
          Pool: <span className="font-medium text-ash-text">{poolName}</span>
          {lockAtIso ? (
            <>
              {" "}
              · Picks lock:{" "}
              <span className="text-ash-text">
                {formatPoolLockSummary(lockAtIso)}
              </span>
            </>
          ) : (
            <> · No lock time set in pool settings yet.</>
          )}
        </p>
        <p className="mt-2 text-xs">
          Emails send through Resend when{" "}
          <code className="rounded bg-ash-body px-1">RESEND_API_KEY</code> and{" "}
          <code className="rounded bg-ash-body px-1">INVITE_FROM_EMAIL</code>{" "}
          are set (same as invite emails). If they are missing, you will see a
          clear message and nothing is sent.
        </p>
      </div>

      {loadError ? null : (
        <PoolCommunicationsForm
          poolId={poolId}
          poolName={poolName}
          lockAtIso={lockAtIso}
          participants={participants}
        />
      )}
    </PageContainer>
  );
}
