import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function AdminTournamentStatusLoading() {
  return (
    <PageContainer>
      <PageTitle
        title="Tournament status"
        description="Loading edition, counts, and ledger freshness…"
      />
      <p className="text-sm text-ash-muted" aria-live="polite">
        Loading…
      </p>
    </PageContainer>
  );
}
