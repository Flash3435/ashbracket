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
        description="Run your pool from here: settings, people, picks, scores, and the live leaderboard. Sign in with your organizer account to use these tools."
      />
      <ul className="list-inside list-disc space-y-2 text-sm text-ash-muted">
        <li>
          <Link href="/admin/settings" className="ash-link">
            Pool settings
          </Link>
          <span> — pool name, whether the leaderboard is public, and when picks lock.</span>
        </li>
        <li>
          <Link
            href="/admin/picks"
            className="ash-link"
          >
            Participant picks
          </Link>
          <span> — open anyone’s bracket and update their knockout picks.</span>
        </li>
        <li>
          <Link
            href="/admin/participants"
            className="ash-link"
          >
            Participants
          </Link>
          <span> — add or remove people in the pool.</span>
        </li>
        <li>
          <Link href="/admin/payments" className="ash-link">
            Payments
          </Link>
          <span>
            {" "}
            — who has paid, contact emails, and paid dates. To change status,
            edit the person under Participants.
          </span>
        </li>
        <li>
          <Link
            href="/admin/results"
            className="ash-link"
          >
            Results
          </Link>
          <span>
            {" "}
            — enter the real tournament outcomes (quarterfinals through
            champion). Saving updates scores and the leaderboard.
          </span>
        </li>
        <li>
          <Link
            href="/admin/tournament"
            className="ash-link"
          >
            Tournament sync
          </Link>
          <span>
            {" "}
            — pull in official match data and refresh everyone’s scores from
            that.
          </span>
        </li>
        <li>
          <Link
            href="/admin/tournament/status"
            className="ash-link"
          >
            Tournament status
          </Link>
          <span>
            {" "}
            — quick overview: teams, matches, results, and whether the
            leaderboard looks up to date.
          </span>
        </li>
      </ul>

      <div className="mt-10 max-w-xl">
        <RecomputeStandingsPanel />
      </div>
    </PageContainer>
  );
}
