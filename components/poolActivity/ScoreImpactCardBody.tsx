import Link from "next/link";
import { buildScoreImpactDisplayLines } from "@/lib/poolActivity/scoreImpact/buildScoreImpactDisplay";

type ScoreImpactCardBodyProps = {
  metadata: Record<string, unknown>;
  bodyText: string;
  /** After lock, participant display names may appear for point gains. */
  allowParticipantNames: boolean;
  leaderboardHref?: string | null;
};

export function ScoreImpactCardBody({
  metadata,
  bodyText,
  allowParticipantNames,
  leaderboardHref = null,
}: ScoreImpactCardBodyProps) {
  const display = buildScoreImpactDisplayLines(metadata, {
    allowParticipantNames,
    fallbackBodyText: bodyText,
  });

  if (!display) {
    return (
      <p className="mt-1 whitespace-pre-wrap text-sm text-ash-text">{bodyText}</p>
    );
  }

  const showLeaderboard =
    display.showLeaderboardLink && Boolean(leaderboardHref?.trim());

  return (
    <div className="mt-1 space-y-1 text-sm text-ash-text">
      <p className="font-medium">{display.headline}</p>
      {display.detailLines.map((line) => (
        <p
          key={line}
          className={
            display.showGainerNames && line.startsWith("Biggest boost:")
              ? "text-ash-text"
              : "text-ash-muted"
          }
        >
          {line}
        </p>
      ))}
      {showLeaderboard ? (
        <div className="pt-1">
          <Link
            href={leaderboardHref!}
            className="inline-flex text-xs font-medium text-ash-accent underline-offset-2 hover:underline"
          >
            View leaderboard
          </Link>
        </div>
      ) : null}
    </div>
  );
}
