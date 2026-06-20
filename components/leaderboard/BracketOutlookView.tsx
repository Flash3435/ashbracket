import {
  BRACKET_OUTLOOK_HEADLINE,
  BRACKET_OUTLOOK_INTRO,
  BRACKET_OUTLOOK_OFFICIAL_NOTE,
  BRACKET_OUTLOOK_STANDINGS_BEGIN_NOTE,
} from "@/lib/leaderboard/buildBracketOutlook";
import {
  formatDistributionBucketLine,
  formatHelpfulResultsCount,
  formatTopOutlookGroupSummary,
  formatViewerBehindTopGroupLine,
  type BracketOutlookSummary,
} from "@/lib/leaderboard/bracketOutlookSeparation";
import { StandingsWarmingUpState } from "./StandingsWarmingUpState";

type Props = {
  poolName: string;
  entryCount: number;
  decisiveResultCount?: number;
  revealHref?: string | null;
  /** When false, show warming-up state instead of the outlook summary. */
  showOutlook: boolean;
  summary?: BracketOutlookSummary | null;
};

export function BracketOutlookView({
  poolName,
  entryCount,
  decisiveResultCount = 0,
  revealHref = null,
  showOutlook,
  summary = null,
}: Props) {
  if (!showOutlook || !summary) {
    return (
      <StandingsWarmingUpState
        poolName={poolName}
        entryCount={entryCount}
        decisiveResultCount={decisiveResultCount}
        revealHref={revealHref}
      />
    );
  }

  const topNamesHeading = summary.topNamesUsesSampleLabel
    ? "Sample from top group"
    : "Top names";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-5 py-6 sm:px-6">
        <h2 className="text-lg font-bold text-ash-text sm:text-xl">
          {BRACKET_OUTLOOK_HEADLINE}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted">
          {BRACKET_OUTLOOK_INTRO}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-muted">
          {BRACKET_OUTLOOK_OFFICIAL_NOTE}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ash-text">Top outlook group</h3>
        <p className="text-sm text-ash-muted">{formatTopOutlookGroupSummary(summary)}</p>
      </section>

      {summary.viewer ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ash-text">Your bracket</h3>
          <p className="text-sm text-ash-text">
            {summary.viewer.displayName} —{" "}
            {formatHelpfulResultsCount(summary.viewer.helpedMatchCount)}
          </p>
          <p className="text-sm text-ash-muted">
            {formatViewerBehindTopGroupLine(summary.viewer.behindTopGroup)}
          </p>
        </section>
      ) : null}

      {summary.distributionBuckets.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ash-text">Distribution</h3>
          <ul className="space-y-1 text-sm text-ash-muted">
            {summary.distributionBuckets.map((bucket) => (
              <li key={bucket.label}>{formatDistributionBucketLine(bucket)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.topNames.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ash-text">{topNamesHeading}</h3>
          <ol className="space-y-2">
            {summary.topNames.map((entry, index) => (
              <li
                key={`${entry.displayName}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-ash-text">
                  <span className="mr-2 tabular-nums text-ash-muted">{index + 1}.</span>
                  {entry.displayName}
                </span>
                <span className="text-ash-muted">
                  {formatHelpfulResultsCount(entry.helpedMatchCount)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="text-xs text-ash-muted">{BRACKET_OUTLOOK_STANDINGS_BEGIN_NOTE}</p>
      <p className="text-xs text-ash-muted">{poolName}</p>
    </div>
  );
}
