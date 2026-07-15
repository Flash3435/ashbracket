import type {
  ParticipantRaceOutlook,
  ParticipantRaceOutlookRow,
  RaceOutlookStatus,
  RemainingTournamentPick,
  RemainingTournamentPickKey,
} from "@/lib/pool/buildParticipantRaceOutlook";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import { formatLeaderboardRaceSummaryWithImpact } from "./leaderboardBracketImpactDisplay";

export const EXPANDED_TOP_REMAINING_PICKS_LIMIT = 3;

export type RemainingTournamentPickDisplay = {
  key: RemainingTournamentPickKey;
  icon: string;
  label: string;
  teamName: string;
};

const REMAINING_TOURNAMENT_PICK_DISPLAY: Record<
  RemainingTournamentPickKey,
  { icon: string; label: string }
> = {
  champion: { icon: "🏆", label: "Champion" },
  most_goals: { icon: "⚽", label: "Most Goals" },
  most_yellow_cards: { icon: "🟨", label: "Most Yellow Cards" },
  most_red_cards: { icon: "🟥", label: "Most Red Cards" },
};

/** Compact Details rows: Champion + three bonus picks, in fixed order. */
export function formatRemainingTournamentPicksDisplay(
  picks: RemainingTournamentPick[] | null | undefined,
): RemainingTournamentPickDisplay[] {
  const byKey = new Map((picks ?? []).map((pick) => [pick.key, pick]));
  return (
    Object.keys(REMAINING_TOURNAMENT_PICK_DISPLAY) as RemainingTournamentPickKey[]
  ).map((key) => {
    const meta = REMAINING_TOURNAMENT_PICK_DISPLAY[key];
    const pick = byKey.get(key);
    const teamName = pick?.teamName?.trim() || "—";
    return {
      key,
      icon: meta.icon,
      label: meta.label,
      teamName,
    };
  });
}

export function mapRaceOutlookByParticipantId(
  outlook: ParticipantRaceOutlook | null | undefined,
): Map<string, ParticipantRaceOutlookRow> {
  const map = new Map<string, ParticipantRaceOutlookRow>();
  if (!outlook) return map;
  for (const row of outlook.rows) {
    map.set(row.participantId, row);
  }
  return map;
}

export function formatLeaderboardRaceSummary(
  outlook: ParticipantRaceOutlookRow,
  momentum?: LeaderboardMomentumRow | null,
  bracketImpact?: BracketImpactParticipantRow | null,
): string {
  return formatLeaderboardRaceSummaryWithImpact(outlook, momentum, bracketImpact);
}

export function formatTopRemainingPickLine(
  pick: ParticipantRaceOutlookRow["topRemainingPicks"][number],
): string {
  return `${pick.teamName} ${pick.shortLabel}`;
}

export function expandedTopRemainingPicks(
  outlook: ParticipantRaceOutlookRow,
): ParticipantRaceOutlookRow["topRemainingPicks"] {
  return outlook.topRemainingPicks.slice(0, EXPANDED_TOP_REMAINING_PICKS_LIMIT);
}

export function formatExpandedRemainingPicksMoreLine(
  outlook: ParticipantRaceOutlookRow,
): string | null {
  const remaining =
    outlook.pathValidLivePickCount - EXPANDED_TOP_REMAINING_PICKS_LIMIT;
  if (remaining <= 0) return null;
  return remaining === 1
    ? "+1 more live path"
    : `+${remaining} more live paths`;
}

export type LivePathComparison = "more" | "similar" | "fewer";

export function compareLivePathsToLeader(input: {
  participantLivePathCount: number;
  leaderLivePathCount: number;
}): LivePathComparison {
  const diff = input.participantLivePathCount - input.leaderLivePathCount;
  if (diff > 0) return "more";
  if (diff >= -2) return "similar";
  return "fewer";
}

export function formatRaceOutlookLeaderComparison(
  outlook: ParticipantRaceOutlookRow,
): string {
  if (outlook.rank === 1) {
    const pathLabel =
      outlook.pathValidLivePickCount === 1
        ? "1 live path"
        : `${outlook.pathValidLivePickCount} live paths`;
    return `Currently leading the pool with ${pathLabel} remaining.`;
  }

  const pointsBehind = outlook.pointsBehindLeader;
  const leaderName = outlook.leaderDisplayName || "the leader";
  const base = `Trailing ${leaderName} by ${pointsBehind} pt${pointsBehind === 1 ? "" : "s"}`;

  if (outlook.leaderLivePathCount == null) {
    return `${base}.`;
  }

  const comparison = compareLivePathsToLeader({
    participantLivePathCount: outlook.pathValidLivePickCount,
    leaderLivePathCount: outlook.leaderLivePathCount,
  });

  switch (comparison) {
    case "more":
      return `${base}, with more live paths remaining.`;
    case "similar":
      return `${base}, with similar live paths remaining.`;
    default:
      return `${base}, with fewer live paths remaining.`;
  }
}

export function raceOutlookDetailExplanation(
  outlook: ParticipantRaceOutlookRow,
): string {
  switch (outlook.statusLabel) {
    case "Leading":
      return "Currently atop the standings with path-valid knockout upside still in play.";
    case "Close behind":
      return "Within a few points of the lead with meaningful path-valid knockout upside.";
    case "Champion dead":
      return "Champion path is eliminated, limiting title upside.";
    case "In contention":
      return "Within striking distance with meaningful path-valid knockout upside.";
    default:
      return outlook.pathValidLivePickCount > 0
        ? "Needs several results to break their way to catch the leader."
        : "No major live knockout paths remain.";
  }
}

export function raceOutlookExpandedFallbackCopy(
  outlook: ParticipantRaceOutlookRow,
): string {
  if (outlook.topRemainingPicks.length > 0) {
    return raceOutlookDetailExplanation(outlook);
  }
  return "No major live knockout paths remain.";
}

export function raceStatusBadgeClass(status: RaceOutlookStatus): string {
  switch (status) {
    case "Leading":
      return "border-emerald-500/40 bg-emerald-950/30 text-emerald-100";
    case "Close behind":
      return "border-amber-500/40 bg-amber-950/25 text-amber-100";
    case "In contention":
      return "border-sky-500/40 bg-sky-950/25 text-sky-100";
    case "Champion dead":
      return "border-red-500/40 bg-red-950/25 text-red-200";
    default:
      return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
  }
}
