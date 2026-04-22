import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function NhlAdminPage() {
  return (
    <PageContainer>
      <PageTitle
        title="Admin"
        description="NHL admin area. Phase 1 is a public placeholder only; authentication and role checks will be added when NHL admin tools are implemented."
      />
    </PageContainer>
  );
}
