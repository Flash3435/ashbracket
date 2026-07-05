import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import type { BracketImpactSummaryMetadata } from "@/lib/poolActivity/scoreImpact/types";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";
import type { LeaderboardLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import { formatPointsWithRecentDelta } from "./leaderboardMomentumDisplay";

const LATEST_POINTS_OPTIONS = { showZero: true, latestSuffix: true } as const;

export function formatLivePathsDelta(delta: number): string | null {
  if (delta === 0) return null;
  const formatted = formatPoolPoints(Math.abs(delta));
  return delta > 0 ? `(+${formatted})` : `(−${formatted})`;
}

export function formatLivePathsWithDelta(
  livePathCount: number,
  delta: number | null | undefined,
): string {
  const base =
    livePathCount === 1 ? "1 live path" : `${livePathCount} live paths`;
  if (delta == null || delta === 0) return base;
  const deltaLabel = formatLivePathsDelta(delta);
  return deltaLabel ? `${base} ${deltaLabel}` : base;
}

export function formatUpsetImpactLabel(
  upsetImpact: BracketImpactParticipantRow["upsetImpact"],
): string | null {
  switch (upsetImpact) {
    case "benefited":
      return "Helped by upset";
    case "hurt":
      return "Hurt by upset";
    default:
      return "Neutral";
  }
}

export function formatChampionStatusAfterImpact(
  outlook: ParticipantRaceOutlookRow,
  bracketImpact?: BracketImpactParticipantRow | null,
): string | null {
  if (!outlook.hasChampionPick) return null;
  if (!outlook.championAlive) return "Champion dead";
  if (bracketImpact?.pickedUpsetWinner) return "Upset winner alive";
  return "Champion alive";
}

function formatLatestPointsToken(
  momentum: LeaderboardMomentumRow | null | undefined,
): string | null {
  if (!momentum) return null;
  const pts = formatPoolPoints(momentum.recentPointsGained);
  return momentum.recentPointsGained > 0 ? `+${pts}` : "+0";
}

export function formatLatestMatchScoringLine(
  momentum: LeaderboardMomentumRow | null | undefined,
  event: LeaderboardLatestScoreEventContext | null | undefined,
  bracketImpact?: BracketImpactParticipantRow | null,
): string | null {
  if (!momentum || !event?.hasValidSnapshot) return null;

  const pointsToken = formatLatestPointsToken(momentum);
  if (!pointsToken) return null;

  switch (event.eventKind) {
    case "multi_match":
      return `Latest update: ${pointsToken} from ${event.matchCount} matches`;
    case "scoring_refresh":
      return `Scoring refresh: ${pointsToken}`;
    case "generic_update":
      return `Latest update: ${pointsToken}`;
    case "single_match":
    default:
      break;
  }

  if (
    bracketImpact?.pickedUpsetWinner &&
    event.winnerTeamName &&
    bracketImpact.upsetImpact === "benefited"
  ) {
    return `Latest: ${event.winnerTeamName} upset ${pointsToken}`;
  }

  if (event.matchupShortLabel) {
    return `${event.matchupShortLabel}: ${pointsToken}`;
  }

  if (event.matchLabel) {
    return `Latest: ${event.matchLabel} ${pointsToken}`;
  }

  if (event.winnerTeamName) {
    return `Latest: ${event.winnerTeamName} result ${pointsToken}`;
  }

  return `Latest update: ${pointsToken}`;
}

export function formatLeaderboardBracketImpactLine(input: {
  outlook?: ParticipantRaceOutlookRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
  livePathCount?: number;
}): string | null {
  const { outlook, bracketImpact } = input;
  const livePathCount =
    input.livePathCount ??
    outlook?.pathValidLivePickCount ??
    bracketImpact?.livePathsAfter;
  if (livePathCount == null) return null;

  const parts: string[] = [
    formatLivePathsWithDelta(livePathCount, bracketImpact?.livePathsDelta),
  ];

  const championStatus = outlook
    ? formatChampionStatusAfterImpact(outlook, bracketImpact)
    : bracketImpact
      ? !bracketImpact.championAliveAfter && bracketImpact.championAliveBefore
        ? "Champion dead"
        : bracketImpact.pickedUpsetWinner
          ? "Upset winner alive"
          : bracketImpact.championAliveAfter
            ? "Champion alive"
            : null
      : null;
  if (championStatus) parts.push(championStatus);

  if (bracketImpact?.finalistPathAliveBefore && !bracketImpact.finalistPathAliveAfter) {
    parts.push("Final path lost");
  }

  const upsetLabel = bracketImpact
    ? formatUpsetImpactLabel(bracketImpact.upsetImpact)
    : null;
  if (upsetLabel && upsetLabel !== "Neutral") parts.push(upsetLabel);

  return parts.join(" · ");
}

export function formatLeaderboardRaceSummaryWithImpact(
  outlook: ParticipantRaceOutlookRow,
  momentum?: LeaderboardMomentumRow | null,
  bracketImpact?: BracketImpactParticipantRow | null,
  event?: LeaderboardLatestScoreEventContext | null,
): string {
  const parts: string[] = [
    formatPointsWithRecentDelta(
      outlook.totalPoints,
      momentum,
      LATEST_POINTS_OPTIONS,
    ),
  ];

  const bracketLine = formatLeaderboardBracketImpactLine({ outlook, bracketImpact });
  if (bracketLine) parts.push(bracketLine);

  const upsetLabel =
    bracketImpact &&
    bracketImpact.upsetImpact === "neutral" &&
    !bracketLine?.includes("Neutral")
      ? "Neutral"
      : null;
  if (upsetLabel) parts.push(upsetLabel);

  void event;
  return parts.join(" · ");
}

export function formatLeaderboardLatestImpactSummary(input: {
  totalPoints: number;
  momentum?: LeaderboardMomentumRow | null;
  event?: LeaderboardLatestScoreEventContext | null;
  outlook?: ParticipantRaceOutlookRow | null;
  bracketImpact?: BracketImpactParticipantRow | null;
}): { latestLine: string | null; impactLine: string | null } {
  const latestLine = formatLatestMatchScoringLine(
    input.momentum,
    input.event,
    input.bracketImpact,
  );
  const impactLine = formatLeaderboardBracketImpactLine({
    outlook: input.outlook,
    bracketImpact: input.bracketImpact,
    livePathCount:
      input.outlook?.pathValidLivePickCount ?? input.bracketImpact?.livePathsAfter,
  });

  return { latestLine, impactLine };
}

export function formatBiggestBracketImpactWinnerLine(input: {
  display_name: string;
  live_paths_delta: number;
}): string {
  const delta = formatLivePathsDelta(input.live_paths_delta);
  return delta
    ? `${input.display_name} ${delta} live paths`
    : `${input.display_name} — bracket upside`;
}

export function formatBiggestBracketImpactLoserLine(input: {
  display_name: string;
  live_paths_delta: number;
}): string {
  const delta = formatLivePathsDelta(input.live_paths_delta);
  return delta
    ? `${input.display_name} ${delta} live paths`
    : `${input.display_name} — path damage`;
}

export function formatBracketImpactSummaryLines(input: {
  uniformPointsDelta: number | null;
  affectedCount: number;
  summary: BracketImpactSummaryMetadata | null;
  hasRankMovement: boolean;
  event?: LeaderboardLatestScoreEventContext | null;
}): string[] {
  const lines: string[] = [];
  const { summary, uniformPointsDelta, affectedCount, event } = input;

  if (uniformPointsDelta != null && affectedCount > 0) {
    const pts = formatPoolPoints(uniformPointsDelta);
    const resultLabel =
      event?.matchupShortLabel ??
      event?.matchLabel ??
      (event?.eventKind === "scoring_refresh" || event?.eventKind === "generic_update"
        ? "this scoring update"
        : "this result");
    const bracketLabel =
      affectedCount === 1
        ? "Everyone gained"
        : `All ${affectedCount} participants gained`;
    lines.push(`${bracketLabel} +${pts} from ${resultLabel}.`);
  }

  if (!summary) return lines;

  const futureParts: string[] = [];
  if (summary.champion_lost_count > 0) {
    futureParts.push(`${summary.champion_lost_count} lost champion paths`);
  }
  if (summary.finalist_lost_count > 0) {
    futureParts.push(`${summary.finalist_lost_count} lost finalists`);
  }
  if (summary.upset_winner_kept_count > 0) {
    futureParts.push(
      `${summary.upset_winner_kept_count} kept the upset winner alive`,
    );
  }

  if (futureParts.length > 0) {
    lines.push(
      `The race changed through bracket paths: ${futureParts.join(", ")}.`,
    );
  }

  if (!input.hasRankMovement) {
    const winner = summary.biggest_winners[0];
    const loser = summary.biggest_losers[0];
    if (winner) {
      lines.push(
        `Biggest bracket gain: ${formatBiggestBracketImpactWinnerLine(winner)}.`,
      );
    }
    if (loser) {
      lines.push(
        `Most affected: ${formatBiggestBracketImpactLoserLine(loser)}.`,
      );
    }
  }

  return lines;
}

export function formatMinimalBracketImpactLine(
  momentum: LeaderboardMomentumRow | null | undefined,
  bracketImpact: BracketImpactParticipantRow,
  totalPoints: number,
  event?: LeaderboardLatestScoreEventContext | null,
): string {
  const { latestLine, impactLine } = formatLeaderboardLatestImpactSummary({
    totalPoints,
    momentum,
    event,
    bracketImpact,
  });

  const parts: string[] = [
    formatPointsWithRecentDelta(totalPoints, momentum, LATEST_POINTS_OPTIONS),
  ];
  if (impactLine) parts.push(impactLine);
  void latestLine;
  return parts.join(" · ");
}

export function formatExpandedBracketImpactContext(
  bracketImpact?: BracketImpactParticipantRow | null,
  event?: LeaderboardLatestScoreEventContext | null,
  momentum?: LeaderboardMomentumRow | null,
): string | null {
  const parts: string[] = [];

  const latestLine = formatLatestMatchScoringLine(momentum, event, bracketImpact);
  if (latestLine) parts.push(latestLine);

  if (!bracketImpact) {
    return parts.length > 0 ? parts.join(" ") : null;
  }

  if (bracketImpact.pickedUpsetWinner) {
    parts.push("Picked the match winner.");
  } else if (bracketImpact.pickedEliminatedTeam) {
    parts.push("Had the eliminated side in their bracket path.");
  }

  if (bracketImpact.livePathsDelta !== 0) {
    const delta = formatLivePathsDelta(bracketImpact.livePathsDelta);
    parts.push(
      `Live paths moved from ${bracketImpact.livePathsBefore} to ${bracketImpact.livePathsAfter}${delta ? ` ${delta}` : ""}.`,
    );
  }

  if (bracketImpact.championAliveBefore && !bracketImpact.championAliveAfter) {
    parts.push("Champion path eliminated by this result.");
  }

  if (bracketImpact.finalistPathAliveBefore && !bracketImpact.finalistPathAliveAfter) {
    parts.push("Final path lost.");
  }
  if (
    bracketImpact.semifinalistPathAliveBefore &&
    !bracketImpact.semifinalistPathAliveAfter
  ) {
    parts.push("Semifinal path lost.");
  }

  if (event?.eventKind === "multi_match" && event.matchCount >= 2) {
    parts.push(`${event.matchCount} matches scored in the latest update.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
