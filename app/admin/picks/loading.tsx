import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AdminPicksLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Participant picks"
        description="Loading pool participants, teams, and stages…"
      />
      <p className="text-sm text-zinc-500" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
