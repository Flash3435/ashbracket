import { importanceScoreForKind } from "@/lib/account/buildWhoToCheerFor";
import { buildLiveBracketTracker } from "@/lib/bracket/liveBracketTracker";
import type { LiveBracketMatch } from "@/lib/bracket/liveBracketTracker";
import {
  buildKnockoutMatchPickRows,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "@/lib/picks/knockoutMatchPickRows";
import { getGradualKnockoutSelectionState } from "@/lib/picks/gradualKnockoutUnlock";
import { resolveFullBracketUnlockedForTracker } from "@/lib/bracket/resolveLiveBracketTrackerMode";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { PredictionKind, Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export const TOP_REMAINING_PICKS_LIMIT = 5;

export type PathValidRemainingPick = {
  predictionKind: PredictionKind;
  teamId: string;
  teamName: string;
  shortLabel: string;
};

export type PathValidRaceOutlook = {
  pathValidLivePickCount: number;
  topRemainingPicks: PathValidRemainingPick[];
  championPathDead: boolean;
  hasLiveFinalistPick: boolean;
  hasLiveSemifinalistPick: boolean;
};

function teamNameForId(teamId: string, teamById: Map<string, Team>): string {
  return teamById.get(teamId)?.name?.trim() || "Unknown team";
}

export function shortLabelForPredictionKind(kind: PredictionKind): string {
  switch (kind) {
    case "champion":
      return "champion";
    case "finalist":
      return "finalist";
    case "semifinalist":
      return "semifinalist";
    case "quarterfinalist":
      return "quarterfinalist";
    case "round_of_16":
      return "Round of 16";
    case "round_of_32":
      return "Round of 32";
    default:
      return kind.replace(/_/g, " ");
  }
}

/** Pick is still live when the participant's winner choice is path-valid and unresolved. */
export function liveRemainingTeamIdFromMatch(
  match: LiveBracketMatch,
): string | null {
  const pickId = match.participantPickedWinnerId?.trim();
  if (!pickId) return null;

  if (
    pickId === match.home.teamId?.trim() &&
    match.home.participantPick === "your_pick_alive"
  ) {
    return pickId;
  }
  if (
    pickId === match.away.teamId?.trim() &&
    match.away.participantPick === "your_pick_alive"
  ) {
    return pickId;
  }
  return null;
}

function pickRowKindForR32MatchIndex(matchIndex: number): {
  predictionKind: PredictionKind;
  slotKey: string;
} {
  return {
    predictionKind: "round_of_32",
    slotKey: String(matchIndex + 1),
  };
}

function collectLivePicksFromMatches(
  matches: LiveBracketMatch[],
  rows: KnockoutMatchPickRow[],
  teamById: Map<string, Team>,
  out: PathValidRemainingPick[],
): void {
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const row = rows[i];
    if (!match) continue;

    const teamId = liveRemainingTeamIdFromMatch(match);
    if (!teamId) continue;

    const predictionKind = (row?.savePredictionKind ??
      "round_of_16") as PredictionKind;

    out.push({
      predictionKind,
      teamId,
      teamName: teamNameForId(teamId, teamById),
      shortLabel: shortLabelForPredictionKind(predictionKind),
    });
  }
}

function collectLivePicksFromR32(
  matches: LiveBracketMatch[],
  teamById: Map<string, Team>,
  out: PathValidRemainingPick[],
): void {
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match) continue;

    const teamId = liveRemainingTeamIdFromMatch(match);
    if (!teamId) continue;

    const { predictionKind } = pickRowKindForR32MatchIndex(i);
    out.push({
      predictionKind,
      teamId,
      teamName: teamNameForId(teamId, teamById),
      shortLabel: shortLabelForPredictionKind(predictionKind),
    });
  }
}

function sortAndLimitTopPicks(
  picks: PathValidRemainingPick[],
): PathValidRemainingPick[] {
  return [...picks]
    .sort(
      (a, b) =>
        importanceScoreForKind(b.predictionKind) -
          importanceScoreForKind(a.predictionKind) ||
        a.teamName.localeCompare(b.teamName) ||
        a.predictionKind.localeCompare(b.predictionKind),
    )
    .slice(0, TOP_REMAINING_PICKS_LIMIT);
}

function buildMatchRows(
  bracketKind: KnockoutWizardBracketKind,
  input: {
    slots: KnockoutPickSlotDraft[];
    teams: Team[];
    tournamentMatches: TournamentMatchPublicRow[] | null;
    knockoutBracketPicksUnlocked: boolean;
  },
): KnockoutMatchPickRow[] {
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches,
    teams: input.teams,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });

  return buildKnockoutMatchPickRows({
    bracketKind,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
}

/**
 * Path-valid remaining knockout upside for one participant bracket.
 * Uses the same live bracket tracker resolution as participant bracket display.
 */
export function buildPathValidRaceOutlookForParticipant(input: {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined;
  knockoutBracketPicksUnlocked: boolean;
  championTeamId?: string | null;
}): PathValidRaceOutlook {
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const trackerInput = {
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches ?? null,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };

  const fullBracketUnlocked = resolveFullBracketUnlockedForTracker(trackerInput);
  const tracker = buildLiveBracketTracker({
    ...trackerInput,
    knockoutBracketPicksUnlocked: fullBracketUnlocked,
  });

  const rowInput = {
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches ?? null,
    knockoutBracketPicksUnlocked: fullBracketUnlocked,
  };

  const livePicks: PathValidRemainingPick[] = [];

  collectLivePicksFromR32(tracker.roundOf32, teamById, livePicks);
  collectLivePicksFromMatches(
    tracker.roundOf16,
    buildMatchRows("round_of_16", rowInput),
    teamById,
    livePicks,
  );
  collectLivePicksFromMatches(
    tracker.quarterfinals,
    buildMatchRows("quarterfinalist", rowInput),
    teamById,
    livePicks,
  );
  collectLivePicksFromMatches(
    tracker.semifinals,
    buildMatchRows("semifinalist", rowInput),
    teamById,
    livePicks,
  );
  collectLivePicksFromMatches(
    tracker.final,
    buildMatchRows("finalist", rowInput),
    teamById,
    livePicks,
  );

  const finalLiveTeamId =
    tracker.final.length > 0 ? liveRemainingTeamIdFromMatch(tracker.final[0]!) : null;
  const champId =
    input.championTeamId?.trim() ||
    tracker.champion.teamId?.trim() ||
    null;

  if (
    champId &&
    tracker.champion.participantPickBadge === "your_pick_alive" &&
    finalLiveTeamId !== champId
  ) {
    livePicks.push({
      predictionKind: "champion",
      teamId: champId,
      teamName: teamNameForId(champId, teamById),
      shortLabel: shortLabelForPredictionKind("champion"),
    });
  }

  const championPathDead = Boolean(
    champId && tracker.champion.participantPickBadge === "your_pick_eliminated",
  );

  const topRemainingPicks = sortAndLimitTopPicks(livePicks);
  const hasLiveFinalistPick = livePicks.some((pick) => pick.predictionKind === "finalist");
  const hasLiveSemifinalistPick = livePicks.some(
    (pick) => pick.predictionKind === "semifinalist",
  );

  return {
    pathValidLivePickCount: livePicks.length,
    topRemainingPicks,
    championPathDead,
    hasLiveFinalistPick,
    hasLiveSemifinalistPick,
  };
}
