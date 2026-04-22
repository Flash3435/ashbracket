import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AdminPicksLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Participant picks"
        description="Loading people in your pool, teams, and bracket stages…"
      />
      <p className="text-sm text-ash-muted" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
