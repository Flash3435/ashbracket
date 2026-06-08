import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AccountPicksLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Your picks"
        description="Loading your profiles, teams, and tournament stages…"
      />
      <p className="text-sm text-ash-muted" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
