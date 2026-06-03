import { NhlDraft26PicksEditor } from "@/components/nhldraft26/NhlDraft26PicksEditor";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  formatNhlDraft26PicksLockAtLabel,
  isNhlDraft26PicksLocked,
  NHL_DRAFT26_EVENT,
  NHL_DRAFT26_PICK_COUNT,
} from "@/lib/nhldraft26/config";
import { getNhlDraft26Top10PickSlots } from "@/lib/nhldraft26/draftOrder";
import { fetchNhlDraft26SavedPicksForUser } from "@/lib/nhldraft26/picks/queries";
import { buildNhlDraft26ProspectMap, getNhlDraft26ProspectPool } from "@/lib/nhldraft26/prospects";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "My picks",
  description: "Build and rank your top 10 predictions for the 2026 NHL Draft.",
};

export const dynamic = "force-dynamic";

function filterSavedProspectIds(
  prospectIds: string[],
  pool: ReturnType<typeof buildNhlDraft26ProspectMap>,
): string[] {
  return prospectIds.filter((id) => pool.has(id));
}

export default async function NhlDraft26PicksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/nhldraft26/login?next=/nhldraft26/picks");
  }

  const prospects = getNhlDraft26ProspectPool();
  const pickSlots = getNhlDraft26Top10PickSlots();
  const prospectMap = buildNhlDraft26ProspectMap();
  const picksLocked = isNhlDraft26PicksLocked();
  const lockAtLabel = formatNhlDraft26PicksLockAtLabel();

  const { data: saved, error: loadError } = await fetchNhlDraft26SavedPicksForUser(
    supabase,
    user.id,
  );

  const initialSavedProspectIds = filterSavedProspectIds(saved.prospectIds, prospectMap);

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-6 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ash-text sm:text-3xl">
          My top 10 picks
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Rank {NHL_DRAFT26_PICK_COUNT} prospects from pick 1 through pick {NHL_DRAFT26_PICK_COUNT}.{" "}
          {NHL_DRAFT26_EVENT.prospectPoolNote}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Signed in as{" "}
          <span className="text-slate-300">{user.email ?? "your account"}</span>.{" "}
          <Link
            href="/nhldraft26/rules"
            className="text-amber-300/90 underline-offset-2 hover:underline"
          >
            Scoring rules
          </Link>
        </p>
        {loadError ? (
          <p className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Could not load your saved picks ({loadError}). You can still build a new board below.
          </p>
        ) : null}
        {saved.prospectIds.length > 0 && initialSavedProspectIds.length === 0 ? (
          <p className="mt-3 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Saved picks reference prospects that are no longer in the pool. Choose a new top 10 to
            save again.
          </p>
        ) : null}
      </section>

      <NhlDraft26PicksEditor
        prospects={prospects}
        pickSlots={pickSlots}
        initialSavedProspectIds={initialSavedProspectIds}
        canAttemptSave={!!user}
        picksLocked={picksLocked}
        lockAtLabel={lockAtLabel}
      />
    </PageContainer>
  );
}
