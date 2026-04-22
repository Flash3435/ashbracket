import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function NhlHomePage() {
  return (
    <PageContainer>
      <PageTitle
        title="AshBracket NHL Playoffs"
        description="This is the NHL section home. Playoff picks, scoring, and standings will appear here in a future release."
      />
      <div className="ash-surface px-4 py-5 text-sm text-ash-muted">
        <p>
          You are viewing the isolated NHL area. Additional features will roll
          out in later phases.
        </p>
      </div>
    </PageContainer>
  );
}
