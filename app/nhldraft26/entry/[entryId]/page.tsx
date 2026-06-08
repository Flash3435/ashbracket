import { NhlDraft26PublicPickBoard } from "@/components/nhldraft26/NhlDraft26PublicPickBoard";
import { PageContainer } from "@/components/ui/PageContainer";
import { getNhlDraft26Top10PickSlots } from "@/lib/nhldraft26/draftOrder";
import { fetchNhlDraft26PublicEntry } from "@/lib/nhldraft26/publicEntry";
import { buildNhlDraft26ProspectMap } from "@/lib/nhldraft26/prospects";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ entryId: string }>;
};

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { entryId } = await params;
  const supabase = await createClient();
  const result = await fetchNhlDraft26PublicEntry(supabase, entryId);
  if (!result.ok) {
    return { title: "Draft board" };
  }
  return {
    title: `${result.data.displayName} — Draft board`,
    description: `Public NHL Draft 2026 top-10 predictions for ${result.data.displayName}.`,
  };
}

export default async function NhlDraft26PublicEntryPage({ params }: PageProps) {
  const { entryId } = await params;
  const supabase = await createClient();
  const result = await fetchNhlDraft26PublicEntry(supabase, entryId);

  if (!result.ok) {
    if (result.kind === "not_found") {
      notFound();
    }
    return (
      <PageContainer compactBottom>
        <section className="ash-surface px-4 py-8 sm:px-5">
          <h1 className="text-2xl font-bold text-ash-text">Draft board</h1>
          <p className="mt-3 text-sm text-red-200/95">
            Could not load this board{result.message ? `: ${result.message}` : "."}
          </p>
          <Link
            href="/nhldraft26/leaderboard"
            className="btn-ghost mt-4 inline-block border-amber-500/25 no-underline"
          >
            Back to community board
          </Link>
        </section>
      </PageContainer>
    );
  }

  const { data } = result;
  const pickSlots = getNhlDraft26Top10PickSlots();
  const prospectById = buildNhlDraft26ProspectMap();
  const prospectIds = data.picks
    .sort((a, b) => a.pickNumber - b.pickNumber)
    .map((p) => p.prospectId);

  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-6 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ash-text sm:text-3xl">
          {data.displayName}
        </h1>
        <p className="mt-2 text-sm text-slate-400">Updated {formatUpdatedAt(data.updatedAt)}</p>
        <Link
          href="/nhldraft26/leaderboard"
          className="mt-4 inline-block text-sm font-medium text-amber-300/90 no-underline hover:underline"
        >
          ← Community Draft Board
        </Link>
      </section>

      <section className="ash-surface px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Top 10 predictions</h2>
        <NhlDraft26PublicPickBoard
          pickSlots={pickSlots}
          prospectIds={prospectIds}
          prospectById={prospectById}
        />
      </section>
    </PageContainer>
  );
}
