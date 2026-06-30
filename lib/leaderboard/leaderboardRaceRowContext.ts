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

  const liveLabel =
    outlook.liveKnockoutPicksRemaining === 1
      ? "1 live pick"
      : `${outlook.liveKnockoutPicksRemaining} live picks`;
  parts.push(liveLabel);

  return parts.join(" · ");
}

export function formatLeaderboardChampionDetail(
  outlook: ParticipantRaceOutlookRow,
): string {
  if (!outlook.hasChampionPick) return "No champion pick";
  if (!outlook.championAlive) return "Champion dead";
  return "Champion alive";
}

export function raceOutlookDetailExplanation(
  outlook: ParticipantRaceOutlookRow,
): string {
  switch (outlook.statusLabel) {
    case "Leading":
      return "Currently atop the standings with live knockout picks still in play.";
    case "Champion dead":
      return "Champion pick is eliminated, limiting upside from the title.";
    case "Low upside":
      return "Few remaining live knockout picks compared with nearby entries.";
    case "Dangerous":
      return "Still has many live knockout picks compared with nearby entries.";
    default:
      return "Within striking distance with knockout picks still alive.";
  }
}

export function raceStatusBadgeClass(status: RaceOutlookStatus): string {
  switch (status) {
    case "Leading":
      return "border-emerald-500/40 bg-emerald-950/30 text-emerald-100";
    case "Dangerous":
      return "border-amber-500/40 bg-amber-950/25 text-amber-100";
    case "Champion dead":
      return "border-red-500/40 bg-red-950/25 text-red-200";
    case "Low upside":
      return "border-ash-border/60 bg-ash-body/30 text-ash-muted";
    default:
      return "border-sky-500/30 bg-sky-950/20 text-sky-100";
  }
}
