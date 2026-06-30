import type {
  ParticipantRaceOutlook,
  ParticipantRaceOutlookRow,
  RaceOutlookStatus,
} from "@/lib/pool/buildParticipantRaceOutlook";

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
): string {
  const parts: string[] = [`${outlook.totalPoints} pts`];

  if (!outlook.hasChampionPick) {
    parts.push("No champion pick");
  } else if (!outlook.championAlive) {
    parts.push("Champion dead");
  } else {
    parts.push(`${outlook.championTeamName ?? "Champion"} champion alive`);
  }

  const pathLabel =
    outlook.pathValidLivePickCount === 1
      ? "1 live path"
      : `${outlook.pathValidLivePickCount} live paths`;
  parts.push(pathLabel);

  return parts.join(" · ");
}

export function formatTopRemainingPickLine(
  pick: ParticipantRaceOutlookRow["topRemainingPicks"][number],
): string {
  return `${pick.teamName} ${pick.shortLabel}`;
}

export function raceOutlookDetailExplanation(
  outlook: ParticipantRaceOutlookRow,
): string {
  switch (outlook.statusLabel) {
    case "Leading":
      return "Currently atop the standings with path-valid knockout upside still in play.";
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
    case "In contention":
      return "border-amber-500/40 bg-amber-950/25 text-amber-100";
    case "Champion dead":
      return "border-red-500/40 bg-red-950/25 text-red-200";
    default:
      return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
  }
}
