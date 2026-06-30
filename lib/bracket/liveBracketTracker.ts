import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildEliminatedTeamIdSet } from "./bracketTeamDisplay";
import { WC2026_R32_MATCH_DEFS } from "./wc2026RoundOf32";
import {
  getGradualKnockoutSelectionState,
  type GradualKnockoutSelectionState,
} from "../picks/gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  knockoutMatchStepDef,
  officialR32ParticipantIds,
  readConfirmedR32MatchWinner,
  readParticipantR32MatchWinnerPick,
  type ConfirmedR32WinnerContext,
  type KnockoutWizardBracketKind,
} from "../picks/knockoutMatchPickRows";
import {
  formatTournamentMatchScoreLine,
  isFinishedMatchWithScores,
} from "../tournament/matchScoreDisplay";

export type LiveMatchStatus = "scheduled" | "live" | "finished" | "unknown";

export type TournamentSideOutcome = "advanced" | "eliminated" | "pending";

export type ParticipantPickBadge =
  | "your_pick"
  | "your_pick_alive"
  | "your_pick_eliminated"
  | null;

export type LiveBracketSide = {
  teamId: string | null;
  displayName: string;
  countryCode: string | null;
  tournamentOutcome: TournamentSideOutcome | null;
  participantPick: ParticipantPickBadge;
  eliminatedFromTournament: boolean;
};

export type LiveBracketMatch = {
  matchKey: string;
  fifaMatchNo: number;
  stageCode: string;
  stageLabel: string;
  status: LiveMatchStatus;
  scoreLine: string | null;
  statusLabel: string | null;
  home: LiveBracketSide;
  away: LiveBracketSide;
  participantPickedWinnerId: string | null;
  usesOfficialFixture: boolean;
};

export type LiveBracketTrackerModel = {
  roundOf32: LiveBracketMatch[];
  roundOf16: LiveBracketMatch[];
  quarterfinals: LiveBracketMatch[];
  semifinals: LiveBracketMatch[];
  final: LiveBracketMatch[];
  champion: {
    teamId: string | null;
    displayName: string;
    countryCode: string | null;
    participantPick: boolean;
    eliminatedFromTournament: boolean;
    participantPickBadge: ParticipantPickBadge;
    tournamentOutcome: TournamentSideOutcome | null;
  };
  eliminatedTeamIds: Set<string>;
};

export type BuildLiveBracketTrackerInput = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  knockoutBracketPicksUnlocked: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
};

function normCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return c || null;
}

function teamByMaps(teams: Team[]): {
  teamById: Map<string, Team>;
  teamByCountry: Map<string, Team>;
} {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamByCountry = new Map<string, Team>();
  for (const t of teams) {
    const code = normCode(t.countryCode);
    if (code) teamByCountry.set(code, t);
  }
  return { teamById, teamByCountry };
}

function teamIdForCountry(
  teamByCountry: Map<string, Team>,
  code: string | null | undefined,
): string | null {
  const c = normCode(code);
  return c ? (teamByCountry.get(c)?.id ?? null) : null;
}

function teamLabel(
  teamId: string | null,
  teamById: Map<string, Team>,
  fallback = "TBD",
): string {
  if (!teamId?.trim()) return fallback;
  return teamById.get(teamId.trim())?.name?.trim() || fallback;
}

function countryCodeForTeam(
  teamId: string | null,
  teamById: Map<string, Team>,
): string | null {
  if (!teamId?.trim()) return null;
  return normCode(teamById.get(teamId.trim())?.countryCode);
}

function publicMatchForFifaNo(
  matches: TournamentMatchPublicRow[],
  stageCode: string,
  fifaMatchNo: number,
): TournamentMatchPublicRow | null {
  const direct = `M${fifaMatchNo}`;
  return (
    matches.find((m) => m.stage_code === stageCode && m.match_code === direct) ??
    matches.find(
      (m) =>
        m.stage_code === stageCode && m.match_code.endsWith(`-${fifaMatchNo}`),
    ) ??
    null
  );
}

function r32PublicMatchForIndex(
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
  matchIndex: number,
): TournamentMatchPublicRow | null {
  const fifaMatchNo = 73 + matchIndex;
  const r32 = (tournamentMatches ?? []).filter((m) => m.stage_code === "round_of_32");
  return publicMatchForFifaNo(r32, "round_of_32", fifaMatchNo);
}

function resolveLiveMatchStatus(
  pub: TournamentMatchPublicRow | null,
): LiveMatchStatus {
  if (!pub) return "unknown";
  const status = pub.status.trim().toLowerCase();
  if (status === "finished") return "finished";
  if (status === "live") return "live";
  if (status === "scheduled" || pub.kickoff_at) return "scheduled";
  return "unknown";
}

function statusLabelForMatch(
  status: LiveMatchStatus,
  pub: TournamentMatchPublicRow | null,
): string | null {
  if (!pub) return null;
  if (status === "finished") return "Final";
  if (status === "live") return "Live";
  if (status === "scheduled" && pub.kickoff_at) return "Upcoming";
  return null;
}

function officialWinnerTeamId(
  pub: TournamentMatchPublicRow | null,
  teamByCountry: Map<string, Team>,
): string | null {
  if (!pub?.winner_country_code?.trim()) return null;
  return teamIdForCountry(teamByCountry, pub.winner_country_code);
}

function participantPickBadge(args: {
  teamId: string | null;
  participantPickedWinnerId: string | null;
  matchFinished: boolean;
  tournamentOutcome: TournamentSideOutcome | null;
  eliminatedFromTournament: boolean;
}): ParticipantPickBadge {
  const { teamId, participantPickedWinnerId } = args;
  if (!teamId || !participantPickedWinnerId || teamId !== participantPickedWinnerId) {
    return null;
  }
  if (args.matchFinished) {
    if (args.tournamentOutcome === "advanced") return "your_pick";
    if (args.tournamentOutcome === "eliminated") return "your_pick_eliminated";
    return "your_pick_eliminated";
  }
  if (args.eliminatedFromTournament) return "your_pick_eliminated";
  return "your_pick_alive";
}

function buildLiveSide(args: {
  teamId: string | null;
  teamById: Map<string, Team>;
  officialWinnerId: string | null;
  matchFinished: boolean;
  participantPickedWinnerId: string | null;
  eliminatedTeamIds: Set<string>;
  fallbackName?: string;
}): LiveBracketSide {
  const teamId = args.teamId?.trim() || null;
  const eliminatedFromTournament = Boolean(
    teamId && args.eliminatedTeamIds.has(teamId),
  );

  let tournamentOutcome: TournamentSideOutcome | null = null;
  if (args.matchFinished && teamId && args.officialWinnerId) {
    tournamentOutcome =
      teamId === args.officialWinnerId ? "advanced" : "eliminated";
  } else if (teamId && !args.matchFinished) {
    tournamentOutcome = "pending";
  }

  return {
    teamId,
    displayName: teamLabel(teamId, args.teamById, args.fallbackName ?? "TBD"),
    countryCode: countryCodeForTeam(teamId, args.teamById),
    tournamentOutcome,
    participantPick: participantPickBadge({
      teamId,
      participantPickedWinnerId: args.participantPickedWinnerId,
      matchFinished: args.matchFinished,
      tournamentOutcome,
      eliminatedFromTournament,
    }),
    eliminatedFromTournament,
  };
}

function resolveFixtureSides(args: {
  officialMatch: TournamentMatchPublicRow | null;
  participantHomeId: string | null;
  participantAwayId: string | null;
  teamByCountry: Map<string, Team>;
}): {
  homeId: string | null;
  awayId: string | null;
  usesOfficialFixture: boolean;
} {
  if (args.officialMatch) {
    const homeId = teamIdForCountry(
      args.teamByCountry,
      args.officialMatch.home_country_code,
    );
    const awayId = teamIdForCountry(
      args.teamByCountry,
      args.officialMatch.away_country_code,
    );
    if (homeId && awayId) {
      return { homeId, awayId, usesOfficialFixture: true };
    }
  }
  return {
    homeId: args.participantHomeId,
    awayId: args.participantAwayId,
    usesOfficialFixture: false,
  };
}

function buildLiveMatchFromFixture(args: {
  matchKey: string;
  fifaMatchNo: number;
  stageCode: string;
  stageLabel: string;
  officialMatch: TournamentMatchPublicRow | null;
  participantHomeId: string | null;
  participantAwayId: string | null;
  participantPickedWinnerId: string | null;
  teamById: Map<string, Team>;
  teamByCountry: Map<string, Team>;
  eliminatedTeamIds: Set<string>;
}): LiveBracketMatch {
  const pub = args.officialMatch;
  const status = resolveLiveMatchStatus(pub);
  const matchFinished = Boolean(pub && isFinishedMatchWithScores(pub));
  const officialWinnerId = officialWinnerTeamId(pub, args.teamByCountry);
  const { homeId, awayId, usesOfficialFixture } = resolveFixtureSides({
    officialMatch: pub,
    participantHomeId: args.participantHomeId,
    participantAwayId: args.participantAwayId,
    teamByCountry: args.teamByCountry,
  });

  const participantPick =
    args.participantPickedWinnerId?.trim() &&
    (args.participantPickedWinnerId === homeId ||
      args.participantPickedWinnerId === awayId)
      ? args.participantPickedWinnerId
      : null;

  return {
    matchKey: args.matchKey,
    fifaMatchNo: args.fifaMatchNo,
    stageCode: args.stageCode,
    stageLabel: args.stageLabel,
    status,
    scoreLine: pub ? formatTournamentMatchScoreLine(pub) : null,
    statusLabel: statusLabelForMatch(status, pub),
    usesOfficialFixture,
    participantPickedWinnerId: participantPick,
    home: buildLiveSide({
      teamId: homeId,
      teamById: args.teamById,
      officialWinnerId,
      matchFinished,
      participantPickedWinnerId: participantPick,
      eliminatedTeamIds: args.eliminatedTeamIds,
    }),
    away: buildLiveSide({
      teamId: awayId,
      teamById: args.teamById,
      officialWinnerId,
      matchFinished,
      participantPickedWinnerId: participantPick,
      eliminatedTeamIds: args.eliminatedTeamIds,
    }),
  };
}

function r32Ctx(
  input: BuildLiveBracketTrackerInput,
  gradual: GradualKnockoutSelectionState,
): ConfirmedR32WinnerContext {
  return {
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  };
}

function buildR32Matches(
  input: BuildLiveBracketTrackerInput,
  gradual: GradualKnockoutSelectionState,
  teamById: Map<string, Team>,
  teamByCountry: Map<string, Team>,
  eliminatedTeamIds: Set<string>,
): LiveBracketMatch[] {
  const ctx = r32Ctx(input, gradual);

  return WC2026_R32_MATCH_DEFS.map((def, matchIndex) => {
    const pub = r32PublicMatchForIndex(input.tournamentMatches, matchIndex);
    const { topId, bottomId } = officialR32ParticipantIds(
      matchIndex,
      input.slots,
      ctx,
    );
    const participantPick =
      readParticipantR32MatchWinnerPick(matchIndex, input.slots, ctx) || null;
    const pickInMatch =
      participantPick &&
      (participantPick === topId ||
        participantPick === bottomId ||
        participantPick ===
          teamIdForCountry(teamByCountry, pub?.home_country_code) ||
        participantPick ===
          teamIdForCountry(teamByCountry, pub?.away_country_code))
        ? participantPick
        : null;

    return buildLiveMatchFromFixture({
      matchKey: `M${def.fifaMatchNo}`,
      fifaMatchNo: def.fifaMatchNo,
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      officialMatch: pub,
      participantHomeId: topId,
      participantAwayId: bottomId,
      participantPickedWinnerId: pickInMatch,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    });
  });
}

function buildLaterRoundMatches(
  bracketKind: KnockoutWizardBracketKind,
  input: BuildLiveBracketTrackerInput,
  gradual: GradualKnockoutSelectionState,
  teamById: Map<string, Team>,
  teamByCountry: Map<string, Team>,
  eliminatedTeamIds: Set<string>,
): LiveBracketMatch[] {
  const def = knockoutMatchStepDef(bracketKind);
  if (!def) return [];

  const rows = buildKnockoutMatchPickRows({
    bracketKind,
    slots: input.slots,
    teams: input.teams,
    tournamentMatches: input.tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });

  const stageMatches = (input.tournamentMatches ?? []).filter(
    (m) => m.stage_code === def.stageCode,
  );

  return rows.map((row) => {
    const pub = publicMatchForFifaNo(stageMatches, def.stageCode, row.fifaMatchNo);
    const participantPick = row.winnerTeamId.trim() || null;
    const pickValid =
      participantPick &&
      (participantPick === row.homeTeamId || participantPick === row.awayTeamId)
        ? participantPick
        : null;

    return buildLiveMatchFromFixture({
      matchKey: row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : row.rowKey,
      fifaMatchNo: row.fifaMatchNo,
      stageCode: def.stageCode,
      stageLabel: def.stageLabel,
      officialMatch: pub,
      participantHomeId: row.homeTeamId,
      participantAwayId: row.awayTeamId,
      participantPickedWinnerId: pickValid,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    });
  });
}

export function buildLiveBracketTracker(
  input: BuildLiveBracketTrackerInput,
): LiveBracketTrackerModel {
  const { teamById, teamByCountry } = teamByMaps(input.teams);
  const eliminatedTeamIds = buildEliminatedTeamIdSet(
    input.tournamentMatches,
    input.teams,
  );
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches ?? null,
    fullRoundOf32Official: input.knockoutBracketPicksUnlocked,
  });

  const champRow = input.slots.find((s) => s.predictionKind === "champion");
  const champId = champRow?.teamId.trim() || null;
  const finalMatches = buildLaterRoundMatches(
    "finalist",
    input,
    gradual,
    teamById,
    teamByCountry,
    eliminatedTeamIds,
  );
  const finalMatch = finalMatches[0] ?? null;
  const finalFinished = finalMatch?.status === "finished";
  const officialChampionId =
    finalMatch && finalFinished
      ? (finalMatch.home.tournamentOutcome === "advanced"
          ? finalMatch.home.teamId
          : finalMatch.away.tournamentOutcome === "advanced"
            ? finalMatch.away.teamId
            : null)
      : null;

  let championTournamentOutcome: TournamentSideOutcome | null = null;
  if (champId && finalFinished && officialChampionId) {
    championTournamentOutcome =
      champId === officialChampionId ? "advanced" : "eliminated";
  } else if (champId && !finalFinished) {
    championTournamentOutcome = "pending";
  }

  const championEliminated = Boolean(champId && eliminatedTeamIds.has(champId));
  const championPickBadge = participantPickBadge({
    teamId: champId,
    participantPickedWinnerId: champId,
    matchFinished: finalFinished,
    tournamentOutcome: championTournamentOutcome,
    eliminatedFromTournament: championEliminated,
  });

  return {
    roundOf32: buildR32Matches(
      input,
      gradual,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    ),
    roundOf16: buildLaterRoundMatches(
      "round_of_16",
      input,
      gradual,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    ),
    quarterfinals: buildLaterRoundMatches(
      "quarterfinalist",
      input,
      gradual,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    ),
    semifinals: buildLaterRoundMatches(
      "semifinalist",
      input,
      gradual,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    ),
    final: finalMatches,
    champion: {
      teamId: champId,
      displayName: teamLabel(champId, teamById, "TBD"),
      countryCode: countryCodeForTeam(champId, teamById),
      participantPick: Boolean(champId),
      eliminatedFromTournament: championEliminated,
      participantPickBadge: championPickBadge,
      tournamentOutcome: championTournamentOutcome,
    },
    eliminatedTeamIds,
  };
}
