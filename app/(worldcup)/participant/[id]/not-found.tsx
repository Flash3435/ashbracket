import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function ParticipantNotFound() {
  return (
    <PageContainer>
      <PageTitle
        title="Participant not found"
        description="This profile is not available. The person may not be in a public pool, or the link may be incorrect."
      />
      <Link href="/" className="ash-link text-sm">
        ← Back to standings
      </Link>
    </PageContainer>
  );
}
