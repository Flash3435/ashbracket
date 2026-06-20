import Link from "next/link";
import {
  BRACKET_OUTLOOK_DASHBOARD_BLURB,
  BRACKET_OUTLOOK_HEADLINE,
} from "@/lib/leaderboard/buildBracketOutlook";
import {
  formatDashboardTopGroupLine,
  formatDashboardViewerLine,
  type BracketOutlookSummary,
} from "@/lib/leaderboard/bracketOutlookSeparation";

type Props = {
  summary: BracketOutlookSummary;
  outlookHref: string | null;
  activityHref: string;
  revealHref?: string | null;
};

export function BracketOutlookDashboardCard({
  summary,
  outlookHref,
  activityHref,
  revealHref = null,
}: Props) {
  return (
    <section className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-4">
      <div>
        <h2 className="text-base font-bold text-ash-text">{BRACKET_OUTLOOK_HEADLINE}</h2>
        <p className="mt-0.5 text-xs text-ash-muted">{BRACKET_OUTLOOK_DASHBOARD_BLURB}</p>
      </div>

      <div className="mt-3 space-y-1 text-sm text-ash-muted">
        <p>{formatDashboardTopGroupLine(summary)}</p>
        {summary.viewer ? (
          <p>{formatDashboardViewerLine(summary.viewer, summary.topScore)}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {outlookHref ? (
          <Link href={outlookHref} className="ash-link">
            View outlook
          </Link>
        ) : null}
        <Link href={activityHref} className="ash-link">
          View activity
        </Link>
        {revealHref ? (
          <Link href={revealHref} className="ash-link">
            Reveal
          </Link>
        ) : null}
      </div>
    </section>
  );
}
