import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AdminPicksLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Participant picks"
        description="Loading pool participants, teams, and stages…"
      />
      <p className="text-sm text-ash-muted" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
