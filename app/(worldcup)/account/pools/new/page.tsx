import { CreateSelfServePoolForm } from "@/components/account/CreateSelfServePoolForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewPoolPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/account/pools/new");
  }

  return (
    <PageContainer>
      <PageTitle
        title="Create your own pool"
        description="You’ll become the organizer for this pool and can invite friends after it’s created. You can open pool settings, participants, and invite links from the admin dashboard next."
      />

      <div className="mb-6 max-w-2xl space-y-2 text-sm text-ash-muted">
        <p>
          As the pool owner, you can manage this pool’s settings, scoring, and
          other organizers — without app-wide access to other people’s pools.
        </p>
        <p>
          <Link href="/account" className="ash-link">
            Back to my bracket
          </Link>
        </p>
      </div>

      <CreateSelfServePoolForm />
    </PageContainer>
  );
}
