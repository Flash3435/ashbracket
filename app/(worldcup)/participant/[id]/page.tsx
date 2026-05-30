import { notFound } from "next/navigation";
import { PublicParticipantProfile } from "@/components/participant/PublicParticipantProfile";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { getMyParticipantIdInPool } from "@/lib/join/actions";
import { fetchPublicParticipantDetail } from "../../../../lib/participant/fetchPublicParticipantDetail";

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
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          Could not load this profile
          {result.message ? `: ${result.message}` : "."}
        </p>
      </PageContainer>
    );
  }

  const { data } = result;
  const viewerParticipantId = await getMyParticipantIdInPool(data.poolId);
  const isViewer =
    viewerParticipantId !== null && viewerParticipantId === data.participantId;

  return (
    <PageContainer>
      <PublicParticipantProfile detail={data} isViewer={isViewer} />
    </PageContainer>
  );
}
