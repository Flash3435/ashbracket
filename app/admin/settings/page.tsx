import { PoolSettingsForm } from "@/components/admin/PoolSettingsForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  mapPoolSettingsRow,
  type PoolSettingsEditable,
  type PoolSettingsRow,
} from "../../../lib/pools/poolSettingsDb";

export const dynamic = "force-dynamic";

export default async function AdminPoolSettingsPage() {
  let loadError: string | null = null;
  let initial: PoolSettingsEditable | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pools")
      .select("id, name, is_public, lock_at")
      .eq("id", SAMPLE_POOL_ID)
      .maybeSingle();

    if (error) loadError = error.message;
    else if (!data) loadError = "Sample pool row was not found.";
    else initial = mapPoolSettingsRow(data as PoolSettingsRow);
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load pool settings.";
  }

  return (
    <PageContainer>
      <PageTitle
        title="Pool settings"
        description="Name, public visibility, and pick lock time for the configured sample pool. Changes apply immediately in Supabase."
      />

      {loadError ? (
        <div className="space-y-4">
          <p
            className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {loadError}
          </p>
          <p className="text-sm text-ash-muted">
            Ensure the sample pool id matches your database seed and your admin
            account is listed in{" "}
            <code className="rounded bg-ash-body px-1 py-0.5 text-xs text-ash-text">
              app_admins
            </code>
            .
          </p>
        </div>
      ) : initial ? (
        <>
          <p className="mb-6 text-sm text-ash-muted">
            Pool id:{" "}
            <code className="rounded bg-ash-body px-1 py-0.5 text-xs text-ash-text">
              {SAMPLE_POOL_ID}
            </code>
          </p>
          <PoolSettingsForm initial={initial} />
        </>
      ) : (
        <p className="text-sm text-ash-muted">No pool data to display.</p>
      )}
    </PageContainer>
  );
}
