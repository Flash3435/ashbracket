import Link from "next/link";
import {
  BRACKET_OUTLOOK_DASHBOARD_BLURB,
  BRACKET_OUTLOOK_DASHBOARD_FOOTNOTE,
  BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS,
  BRACKET_OUTLOOK_HEADLINE,
  formatBracketOutlookResultLine,
  type ClientSafeBracketOutlookEntry,
} from "@/lib/leaderboard/buildBracketOutlook";

type Props = {
  entries: ClientSafeBracketOutlookEntry[];
  outlookHref: string | null;
  activityHref: string;
  revealHref?: string | null;
};

export function BracketOutlookDashboardCard({
  entries,
  outlookHref,
  activityHref,
  revealHref = null,
}: Props) {
  if (entries.length === 0) return null;

  const rows = entries.slice(0, BRACKET_OUTLOOK_DASHBOARD_MAX_ROWS);

  return (
    <section className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-4">
      <div>
        <h2 className="text-base font-bold text-ash-text">{BRACKET_OUTLOOK_HEADLINE}</h2>
        <p className="mt-0.5 text-xs text-ash-muted">{BRACKET_OUTLOOK_DASHBOARD_BLURB}</p>
      </div>

      <ol className="mt-3 space-y-2">
        {rows.map((entry, index) => (
          <li
            key={`${entry.displayName}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="text-ash-text">
              <span className="font-medium tabular-nums text-ash-muted">{index + 1}.</span>{" "}
              {entry.displayName}
            </span>
            <span className="text-ash-muted">{formatBracketOutlookResultLine(entry)}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-ash-muted">{BRACKET_OUTLOOK_DASHBOARD_FOOTNOTE}</p>

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
