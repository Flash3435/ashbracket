import { NhlPublicEntryProfile } from "@/components/nhl/NhlPublicEntryProfile";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { prepareNhlEditionBracketForScoring } from "@/lib/nhl/prepareNhlEditionBracket";
import { fetchNhlPublicEntryDetail } from "@/lib/nhl/publicEntryDetail";
import { fetchActiveNhlEdition } from "@/lib/nhl/queries";
import { formatNhlStandingsLoadError } from "@/lib/nhl/standingsLabels";
import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ membershipId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { membershipId } = await params;
  const supabase = await createClient();
  const result = await fetchNhlPublicEntryDetail(supabase, membershipId);
  if (!result.ok) {
    return { title: "NHL entry" };
  }
  return {
    title: `${result.data.entryName} — NHL picks`,
    description: `Public pick breakdown for ${result.data.entryName} on the active AshBracket NHL playoff leaderboard.`,
  };
}

export default async function NhlPublicEntryPage({ params }: PageProps) {
  noStore();
  await connection();
  const { membershipId } = await params;
  const supabase = await createClient();

  const { edition } = await fetchActiveNhlEdition(supabase);
  if (edition) {
    await prepareNhlEditionBracketForScoring(edition.id, supabase);
  }

  const result = await fetchNhlPublicEntryDetail(supabase, membershipId);

  if (!result.ok) {
    if (result.kind === "not_found") {
      notFound();
    }
    return (
      <PageContainer>
        <PageTitle
          title="NHL entry"
          description="Public series picks and results for this leaderboard entry."
        />
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Could not load this entry
          {result.message ? `: ${formatNhlStandingsLoadError(result.message)}` : "."}
        </p>
      </PageContainer>
    );
  }

  const { data } = result;

  return (
    <PageContainer>
      <PageTitle
        title={data.entryName}
        description={`${data.editionName}${data.seasonLabel ? ` · ${data.seasonLabel}` : ""} — public pick breakdown`}
      />
      <NhlPublicEntryProfile detail={data} />
    </PageContainer>
  );
}
