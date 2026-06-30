import Link from "next/link";

type Props = {
  picksHref: string;
  leaderboardHref: string | null;
  activityHref: string;
  accountHref?: string;
};

export function DashboardSecondaryLinks({
  picksHref,
  leaderboardHref,
  activityHref,
  accountHref = "/account/change-password",
}: Props) {
  return (
    <nav
      className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ash-muted"
      aria-label="More bracket links"
    >
      <Link href={picksHref} className="ash-link">
        View all picks
      </Link>
      {leaderboardHref ? (
        <Link href={leaderboardHref} className="ash-link">
          Leaderboard
        </Link>
      ) : null}
      <Link href={activityHref} className="ash-link">
        Activity
      </Link>
      <Link href="/rules" className="ash-link">
        Rules
      </Link>
      <Link href={accountHref} className="ash-link text-ash-muted">
        Account
      </Link>
    </nav>
  );
}
