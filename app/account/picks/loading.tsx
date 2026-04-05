import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AccountPicksLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Your picks"
        description="Loading your profiles, teams, and tournament stages…"
      />
      <p className="text-sm text-zinc-500" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
