import { PoolSettingsForm } from "@/components/admin/PoolSettingsForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import {
  mapPoolSettingsRow,
  type PoolSettingsEditable,
  type PoolSettingsRow,
} from "@/lib/pools/poolSettingsDb";

export const dynamic = "force-dynamic";

export default async function AdminPoolSettingsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase } = await requireManagedPool(poolId);

  let loadError: string | null = null;
  let initial: PoolSettingsEditable | null = null;

  try {
    const { data, error } = await supabase
      .from("pools")
      .select("id, name, is_public, lock_at")
      .eq("id", poolId)
      .maybeSingle();

    if (error) loadError = error.message;
    else if (!data) loadError = "Pool settings could not be loaded.";
    else initial = mapPoolSettingsRow(data as PoolSettingsRow);
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load pool settings.";
  }

  return (
    <PageContainer>
      <PageTitle
        title="Pool settings"
        description="Set your pool’s name, whether the leaderboard and rules are visible to the public, and when picks must be in by."
      />

      {loadError ? (
        <div className="space-y-4">
          <p
            className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {loadError}
          </p>
        </div>
      ) : initial ? (
        <PoolSettingsForm poolId={poolId} initial={initial} />
      ) : (
        <p className="text-sm text-ash-muted">No pool data to display.</p>
      )}
    </PageContainer>
  );
}
