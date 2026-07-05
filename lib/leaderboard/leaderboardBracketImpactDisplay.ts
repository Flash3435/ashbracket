import { formatPoolPoints } from "@/lib/format/poolPoints";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import type { BracketImpactSummaryMetadata } from "@/lib/poolActivity/scoreImpact/types";
import type { ParticipantRaceOutlookRow } from "@/lib/pool/buildParticipantRaceOutlook";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import { formatPointsWithRecentDelta } from "./leaderboardMomentumDisplay";

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
      return "Benefited from upset";
    case "hurt":
      return "Hurt by upset";
    default:
      return null;
  }
}

export function formatChampionStatusAfterImpact(
  outlook: ParticipantRaceOutlookRow,
  bracketImpact?: BracketImpactParticipantRow | null,
): string | null {
  if (!outlook.hasChampionPick) return null;
  if (!outlook.championAlive) return "Champion dead";
  if (bracketImpact?.pickedUpsetWinner) return "Upset winner alive";
  return `${outlook.championTeamName ?? "Champion"} champion alive`;
}

export function formatLeaderboardRaceSummaryWithImpact(
  outlook: ParticipantRaceOutlookRow,
  momentum?: LeaderboardMomentumRow | null,
  bracketImpact?: BracketImpactParticipantRow | null,
): string {
  const parts: string[] = [
    formatPointsWithRecentDelta(outlook.totalPoints, momentum, { showZero: true }),
  ];

  const championStatus = formatChampionStatusAfterImpact(outlook, bracketImpact);
  if (championStatus) parts.push(championStatus);

  parts.push(
    formatLivePathsWithDelta(
      outlook.pathValidLivePickCount,
      bracketImpact?.livePathsDelta,
    ),
  );

  const upsetLabel = bracketImpact
    ? formatUpsetImpactLabel(bracketImpact.upsetImpact)
    : null;
  if (upsetLabel) parts.push(upsetLabel);

  return parts.join(" · ");
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
}): string[] {
  const lines: string[] = [];
  const { summary, uniformPointsDelta, affectedCount } = input;

  if (uniformPointsDelta != null && affectedCount > 0) {
    const pts = formatPoolPoints(uniformPointsDelta);
    const bracketLabel =
      affectedCount === 1 ? "Everyone gained" : `All ${affectedCount} participants gained`;
    lines.push(`${bracketLabel} +${pts} from this scoring update.`);
  }

  if (!summary) return lines;

  const futureParts: string[] = [];
  if (summary.champion_lost_count > 0) {
    futureParts.push(
      `${summary.champion_lost_count} lost their champion`,
    );
  }
  if (summary.finalist_lost_count > 0) {
    futureParts.push(
      `${summary.finalist_lost_count} lost a finalist path`,
    );
  }
  if (summary.upset_winner_kept_count > 0) {
    futureParts.push(
      `${summary.upset_winner_kept_count} kept the upset winner alive`,
    );
  }

  if (futureParts.length > 0) {
    lines.push(`But the upset changed future paths: ${futureParts.join(", ")}.`);
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
): string {
  const parts: string[] = [
    formatPointsWithRecentDelta(totalPoints, momentum, { showZero: true }),
  ];

  parts.push(
    formatLivePathsWithDelta(
      bracketImpact.livePathsAfter,
      bracketImpact.livePathsDelta,
    ),
  );

  if (!bracketImpact.championAliveAfter && bracketImpact.championAliveBefore) {
    parts.push("Champion dead");
  } else if (bracketImpact.pickedUpsetWinner) {
    parts.push("Upset winner alive");
  }

  const upsetLabel = formatUpsetImpactLabel(bracketImpact.upsetImpact);
  if (upsetLabel) parts.push(upsetLabel);

  return parts.join(" · ");
}

export function formatExpandedBracketImpactContext(
  bracketImpact?: BracketImpactParticipantRow | null,
): string | null {
  if (!bracketImpact) return null;

  const parts: string[] = [];
  if (bracketImpact.livePathsDelta !== 0) {
    const delta = formatLivePathsDelta(bracketImpact.livePathsDelta);
    parts.push(
      `Live paths moved from ${bracketImpact.livePathsBefore} to ${bracketImpact.livePathsAfter}${delta ? ` ${delta}` : ""}.`,
    );
  }

  if (bracketImpact.championAliveBefore && !bracketImpact.championAliveAfter) {
    parts.push("Champion path eliminated by this result.");
  } else if (bracketImpact.pickedUpsetWinner) {
    parts.push("Had the match winner in their bracket path.");
  } else if (bracketImpact.pickedEliminatedTeam) {
    parts.push("Had the eliminated side in their bracket path.");
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

  return parts.length > 0 ? parts.join(" ") : null;
}
