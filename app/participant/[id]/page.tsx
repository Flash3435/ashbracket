import { notFound } from "next/navigation";
import { PublicParticipantProfile } from "@/components/participant/PublicParticipantProfile";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchPublicParticipantDetail } from "../../../lib/participant/fetchPublicParticipantDetail";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PublicParticipantPage({ params }: PageProps) {
  const { id } = await params;
  const result = await fetchPublicParticipantDetail(id);

  if (!result.ok) {
    if (result.kind === "not_found") {
      notFound();
    }
    return (
      <PageContainer>
        <PageTitle
          title="Participant"
          description="Public profile and picks for this pool."
        />
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load this profile
          {result.message ? `: ${result.message}` : "."}
        </p>
      </PageContainer>
    );
  }

  const { data } = result;

  return (
    <PageContainer>
      <PageTitle
        title={data.displayName}
        description={`${data.poolName} · ${data.totalPoints} pts · Rank ${data.rank}`}
      />
      <PublicParticipantProfile detail={data} />
    </PageContainer>
  );
}
