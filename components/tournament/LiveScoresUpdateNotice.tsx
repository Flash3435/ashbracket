import {
  formatPublicLiveScoresLastUpdated,
  PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE_LABEL,
} from "@/lib/tournament/liveDailyUpdateStatus";

type Props = {
  lastUpdatedAt: string | null;
  className?: string;
};

export function LiveScoresUpdateNotice({ lastUpdatedAt, className = "" }: Props) {
  const formatted = formatPublicLiveScoresLastUpdated(lastUpdatedAt);

  return (
    <aside
      className={`rounded-lg border border-ash-border/70 bg-ash-body/30 px-4 py-3 text-sm leading-relaxed text-ash-muted ${className}`.trim()}
      aria-label="Score update schedule"
    >
      <p>
        Scores are updated daily after completed matches are recorded. This is not a
        live, play-by-play feed.
      </p>
      {formatted ? (
        <p className="mt-1.5">
          <span className="font-medium text-ash-text">Last updated:</span> {formatted}
        </p>
      ) : (
        <p className="mt-1.5 text-ash-border-hover">
          Last updated time will appear here after the organizer&apos;s first daily refresh.
        </p>
      )}
      <p className="mt-1.5 text-xs text-ash-border-hover">
        Times shown in {PUBLIC_LIVE_SCORES_UPDATE_TIMEZONE_LABEL}.
      </p>
    </aside>
  );
}
