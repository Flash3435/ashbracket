import {
  AWAITING_RESULT_BRACKET_LABEL,
  NO_CHAMPION_PICK_SAVED_LABEL,
  NO_SAVED_PICK_BRACKET_LABEL,
} from "./knockoutBracketDisplayCopy";
import type {
  LiveBracketMatch,
  LiveBracketSide,
  LiveBracketTrackerModel,
} from "./liveBracketTracker";
import type { Team } from "../../src/types/domain";

export type AdminTeamStatusBadgeTone =
  | "picked"
  | "picked_advanced"
  | "picked_out"
  | "advanced"
  | "eliminated"
  | "not_picked"
  | "neutral";

export type AdminTeamStatusBadge = {
  label: string;
  tone: AdminTeamStatusBadgeTone;
};

export type AdminMatchOutcomeSummary = {
  text: string;
  tone: "success" | "error" | "muted" | "warning" | "neutral";
};

export type AdminParticipantPicksSummary = {
  championPick: string | null;
  championStatus: "saved" | "missing" | "unreachable";
  finalPicks: string[];
  livePicks: string[];
  eliminatedPicks: string[];
  missingSlots: string[];
  stalePicks: string[];
};

function teamName(teamId: string | null, teamById: Map<string, Team>): string | null {
  if (!teamId?.trim()) return null;
  return teamById.get(teamId.trim())?.name?.trim() ?? null;
}

function officialAdvancerId(match: LiveBracketMatch): string | null {
  if (match.home.tournamentOutcome === "advanced") return match.home.teamId;
  if (match.away.tournamentOutcome === "advanced") return match.away.teamId;
  return null;
}

function matchHasSavedPick(match: LiveBracketMatch): boolean {
  return Boolean(match.participantPickedWinnerId?.trim());
}

function sideIsParticipantPick(side: LiveBracketSide): boolean {
  return (
    side.participantPick === "your_pick" ||
    side.participantPick === "your_pick_alive" ||
    side.participantPick === "your_pick_eliminated" ||
    side.participantPick === "your_pick_wrong_path"
  );
}

/** One primary status badge per team row for admin bracket view. */
export function resolveAdminTeamStatusBadge(side: LiveBracketSide): AdminTeamStatusBadge | null {
  if (side.fillState === "no_saved_pick") {
    return { label: "Not picked", tone: "not_picked" };
  }
  if (side.fillState === "awaiting" && !side.teamId) {
    return null;
  }

  const picked =
    side.participantPick === "your_pick" ||
    side.participantPick === "your_pick_alive" ||
    side.participantPick === "your_pick_eliminated" ||
    side.participantPick === "your_pick_wrong_path";

  if (picked) {
    if (
      side.participantPick === "your_pick_eliminated" ||
      side.participantPick === "your_pick_wrong_path"
    ) {
      return { label: "Picked out", tone: "picked_out" };
    }
    if (side.tournamentOutcome === "advanced") {
      return { label: "Picked + advanced", tone: "picked_advanced" };
    }
    return { label: "Picked", tone: "picked" };
  }

  if (side.tournamentOutcome === "advanced") {
    return { label: "Advanced", tone: "advanced" };
  }
  if (side.tournamentOutcome === "eliminated") {
    return { label: "Eliminated", tone: "eliminated" };
  }

  return null;
}

/** Compact match footer explaining pick vs official result. */
export function resolveAdminMatchOutcomeSummary(
  match: LiveBracketMatch,
  teamById: Map<string, Team>,
): AdminMatchOutcomeSummary {
  const pickId = match.participantPickedWinnerId?.trim() || null;
  const pickLockedOut = [match.home, match.away].some(
    (s) => s.participantPick === "your_pick_wrong_path",
  );

  if (pickLockedOut && pickId) {
    return { text: "Pick out — team not in this match", tone: "warning" };
  }

  if (!pickId) {
    if (match.status !== "finished") {
      return { text: "No pick saved", tone: "muted" };
    }
    const advancerName = teamName(officialAdvancerId(match), teamById);
    if (advancerName) {
      return { text: `No pick saved · ${advancerName} advanced`, tone: "muted" };
    }
    return { text: "No pick saved", tone: "muted" };
  }

  if (match.status !== "finished") {
    const pickName = teamName(pickId, teamById);
    return {
      text: pickName ? `Waiting for result · pick: ${pickName}` : "Waiting for result",
      tone: "neutral",
    };
  }

  const advancerId = officialAdvancerId(match);
  const advancerName = teamName(advancerId, teamById);
  const pickName = teamName(pickId, teamById) ?? "Unknown team";

  if (advancerId && pickId === advancerId) {
    return { text: `Pick correct: ${pickName}`, tone: "success" };
  }

  if (advancerName) {
    return { text: `Pick missed: ${advancerName} advanced`, tone: "error" };
  }

  return { text: `Pick saved: ${pickName}`, tone: "neutral" };
}

export function resolveAdminChampionSummaryLine(
  champion: LiveBracketTrackerModel["champion"],
  teamById: Map<string, Team>,
): { line: string; tone: AdminMatchOutcomeSummary["tone"] } {
  if (!champion.hasSavedPick || !champion.teamId) {
    return { line: NO_CHAMPION_PICK_SAVED_LABEL, tone: "muted" };
  }

  const name = teamName(champion.teamId, teamById) ?? champion.displayName;

  if (
    champion.participantPickBadge === "your_pick_eliminated" ||
    champion.participantPickBadge === "your_pick_wrong_path" ||
    champion.eliminatedFromTournament
  ) {
    return { line: "Champion pick out — team not in the final", tone: "warning" };
  }

  return { line: `Champion pick: ${name}`, tone: "success" };
}

function matchSlotLabel(match: LiveBracketMatch): string {
  const no = match.fifaMatchNo > 0 ? `M${match.fifaMatchNo}` : match.matchKey;
  return `${match.stageLabel} (${no})`;
}

/** Aggregate participant pick health for the admin summary panel. */
export function buildAdminParticipantPicksSummary(
  tracker: LiveBracketTrackerModel,
  teamById: Map<string, Team>,
): AdminParticipantPicksSummary {
  const allMatches = [
    ...tracker.roundOf32,
    ...tracker.roundOf16,
    ...tracker.quarterfinals,
    ...tracker.semifinals,
    ...tracker.final,
  ];

  const livePicks = new Set<string>();
  const eliminatedPicks = new Set<string>();
  const stalePicks = new Set<string>();
  const missingSlots: string[] = [];

  for (const match of allMatches) {
    const slotLabel = matchSlotLabel(match);
    const hasPick = matchHasSavedPick(match);
    const bothEmpty =
      match.home.fillState === "no_saved_pick" && match.away.fillState === "no_saved_pick";

    if (bothEmpty && !hasPick) {
      missingSlots.push(slotLabel);
    }

    if (match.participantPickedWinnerId) {
      const pickName = teamName(match.participantPickedWinnerId, teamById);
      if (pickName) {
        const pickSide = [match.home, match.away].find((s) => sideIsParticipantPick(s));
        if (pickSide?.participantPick === "your_pick_wrong_path") {
          stalePicks.add(pickName);
        } else if (
          pickSide?.participantPick === "your_pick_eliminated" ||
          pickSide?.eliminatedFromTournament
        ) {
          eliminatedPicks.add(pickName);
        } else if (
          pickSide?.participantPick === "your_pick" ||
          pickSide?.participantPick === "your_pick_alive"
        ) {
          livePicks.add(pickName);
        }
      }
    }
  }

  const championLine = resolveAdminChampionSummaryLine(tracker.champion, teamById);
  const championPick =
    tracker.champion.hasSavedPick && tracker.champion.teamId
      ? teamName(tracker.champion.teamId, teamById)
      : null;

  let championStatus: AdminParticipantPicksSummary["championStatus"] = "missing";
  if (championPick) {
    championStatus =
      championLine.tone === "warning" ? "unreachable" : "saved";
  }

  const finalPicks = tracker.final
    .flatMap((m) => {
      const names: string[] = [];
      if (m.participantPickedWinnerId) {
        const n = teamName(m.participantPickedWinnerId, teamById);
        if (n) names.push(n);
      }
      for (const side of [m.home, m.away]) {
        if (sideIsParticipantPick(side) && side.teamId) {
          const n = teamName(side.teamId, teamById);
          if (n && !names.includes(n)) names.push(n);
        }
      }
      return names;
    })
    .filter(Boolean);

  return {
    championPick,
    championStatus,
    finalPicks,
    livePicks: [...livePicks].sort(),
    eliminatedPicks: [...eliminatedPicks].sort(),
    missingSlots,
    stalePicks: [...stalePicks].sort(),
  };
}

export function adminBadgeToneClassName(tone: AdminTeamStatusBadgeTone): string {
  switch (tone) {
    case "picked":
      return "bg-ash-accent/25 text-ash-accent ring-ash-accent/35";
    case "picked_advanced":
      return "bg-emerald-950/50 text-emerald-200 ring-emerald-800/50";
    case "picked_out":
      return "bg-red-950/50 text-red-200 ring-red-900/40";
    case "advanced":
      return "bg-emerald-950/35 text-emerald-200/90 ring-emerald-800/40";
    case "eliminated":
      return "bg-ash-body/80 text-ash-muted ring-ash-border/60";
    case "not_picked":
      return "bg-ash-body/70 text-ash-muted ring-ash-border/50";
    default:
      return "bg-ash-body/70 text-ash-muted ring-ash-border/50";
  }
}

export function adminOutcomeToneClassName(tone: AdminMatchOutcomeSummary["tone"]): string {
  switch (tone) {
    case "success":
      return "text-emerald-200";
    case "error":
      return "text-red-200";
    case "warning":
      return "text-amber-200";
    case "muted":
      return "text-ash-muted";
    default:
      return "text-ash-muted/90";
  }
}

/** Display labels used in tests and snapshots. */
export const ADMIN_BRACKET_EMPTY_LABELS = {
  noSavedPick: NO_SAVED_PICK_BRACKET_LABEL,
  awaitingResult: AWAITING_RESULT_BRACKET_LABEL,
  noChampionPick: NO_CHAMPION_PICK_SAVED_LABEL,
} as const;
