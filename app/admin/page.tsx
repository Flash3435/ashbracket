import { RecomputeStandingsPanel } from "@/components/admin/RecomputeStandingsPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <PageContainer>
      <PageTitle
        title="Admin"
        description="Configure pools, invite participants, and manage the tournament. These routes require an admin sign-in."
      />
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-600">
        <li>
          <Link
            href="/admin/settings"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Pool settings
          </Link>
          <span> — name, public visibility, and lock time.</span>
        </li>
        <li>
          <Link
            href="/admin/picks"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Participant picks
          </Link>
          <span> — edit knockout picks per participant.</span>
        </li>
        <li>
          <Link
            href="/admin/participants"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Participants
          </Link>
          <span> — manage who is in the pool.</span>
        </li>
        <li>
          <Link
            href="/admin/results"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Results
          </Link>
          <span>
            {" "}
            — enter quarterfinalists through champion (each save recomputes
            standings).
          </span>
        </li>
        <li>
          <Link
            href="/admin/tournament"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Tournament sync
          </Link>
          <span>
            {" "}
            — official matches, automated scoring rows, recompute standings.
          </span>
        </li>
        <li>
          <Link
            href="/admin/tournament/status"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Tournament status
          </Link>
          <span>
            {" "}
            — counts, sync timestamps, sample pool ledger freshness, overrides.
          </span>
        </li>
      </ul>

      <div className="mt-10 max-w-xl">
        <RecomputeStandingsPanel />
      </div>
    </PageContainer>
  );
}
