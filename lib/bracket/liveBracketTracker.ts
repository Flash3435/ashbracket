import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildEliminatedTeamIdSet } from "./bracketTeamDisplay";
import { deriveParticipantBracket } from "./deriveParticipantBracket";
import {
  FINAL_FEEDER_NO_CHAMPION_HELPER,
  NO_CHAMPION_PICK_SAVED_LABEL,
  NO_SAVED_PICK_BRACKET_LABEL,
  AWAITING_RESULT_BRACKET_LABEL,
  OFFICIAL_ADVANCED_NOT_YOUR_PICK_TOOLTIP,
  NO_SAVED_PICK_BRACKET_TOOLTIP,
} from "./knockoutBracketDisplayCopy";
import { resolveFullBracketUnlockedForTracker } from "./resolveLiveBracketTrackerMode";
import type { BracketMatchResolved } from "./types";
import { WC2026_R32_MATCH_DEFS } from "./wc2026RoundOf32";
import {
  getGradualKnockoutSelectionState,
  type GradualKnockoutSelectionState,
} from "../picks/gradualKnockoutUnlock";
import { r16R32ParticipantPair } from "./wc2026KnockoutPairings";
import {
  buildKnockoutMatchPickRows,
  knockoutMatchStepDef,
  officialR32ParticipantIds,
  readConfirmedR32MatchWinner,
  readParticipantR32MatchWinnerPick,
  storedFeederSideTeamIdsForMatch,
  validatedKnockoutMatchWinner,
  type ConfirmedR32WinnerContext,
  type KnockoutWizardBracketKind,
} from "../picks/knockoutMatchPickRows";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { isKnockoutPickLockedOut } from "../predictions/knockoutPickStatus";
import {
  formatTournamentMatchScoreLine,
  isFinishedMatchWithScores,
} from "../tournament/matchScoreDisplay";

export type LiveMatchStatus = "scheduled" | "live" | "finished" | "unknown";

export type TournamentSideOutcome = "advanced" | "eliminated" | "pending";

export type ParticipantPickBadge =
  | "your_pick"
  | "your_pick_alive"
  | "your_pick_auto_carried"
  | "your_pick_eliminated"
  | "your_pick_wrong_path"
  | "not_your_pick"
  | null;

export type LiveBracketSideFillState = "team" | "no_saved_pick" | "awaiting";

export type LiveBracketSide = {
  teamId: string | null;
  displayName: string;
  countryCode: string | null;
  tournamentOutcome: TournamentSideOutcome | null;
  participantPick: ParticipantPickBadge;
  eliminatedFromTournament: boolean;
  fillState: LiveBracketSideFillState;
  helperTooltip: string | null;
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
  /** True when the displayed winner was inferred from upstream surviving picks. */
  isAutoCarriedPick?: boolean;
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
    hasSavedPick: boolean;
    emptyLabel: string;
    participantPick: boolean;
    eliminatedFromTournament: boolean;
    participantPickBadge: ParticipantPickBadge;
    tournamentOutcome: TournamentSideOutcome | null;
  };
  /** Shown under M104 when feeder teams exist but champion is unsaved. */
  finalHelperCopy: string | null;
  /** True when any knockout progression pick exists — controls champion card visibility. */
  showChampionCard: boolean;
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
  savedPickLockedOut: boolean;
  isAutoCarriedPick?: boolean;
}): ParticipantPickBadge {
  const { teamId, participantPickedWinnerId } = args;
  if (!teamId) return null;

  if (participantPickedWinnerId && teamId === participantPickedWinnerId) {
    if (args.isAutoCarriedPick) {
      return "your_pick_auto_carried";
    }
    if (args.matchFinished) {
      if (args.tournamentOutcome === "advanced") return "your_pick";
      if (args.tournamentOutcome === "eliminated") return "your_pick_eliminated";
      return "your_pick_eliminated";
    }
    if (args.savedPickLockedOut) {
      return args.eliminatedFromTournament
        ? "your_pick_eliminated"
        : "your_pick_wrong_path";
    }
    if (args.eliminatedFromTournament) return "your_pick_eliminated";
    return "your_pick_alive";
  }

  if (
    args.matchFinished &&
    args.tournamentOutcome === "advanced" &&
    teamId !== participantPickedWinnerId
  ) {
    return "not_your_pick";
  }

  return null;
}

function resolveSideFillState(args: {
  teamId: string | null;
  usesOfficialFixture: boolean;
  siblingHasTeam: boolean;
}): LiveBracketSideFillState {
  if (args.teamId) return "team";
  if (args.usesOfficialFixture || args.siblingHasTeam) return "awaiting";
  return "no_saved_pick";
}

function sideDisplayName(
  teamId: string | null,
  teamById: Map<string, Team>,
  fillState: LiveBracketSideFillState,
): string {
  if (teamId) return teamLabel(teamId, teamById);
  if (fillState === "no_saved_pick") return NO_SAVED_PICK_BRACKET_LABEL;
  if (fillState === "awaiting") return AWAITING_RESULT_BRACKET_LABEL;
  return "TBD";
}

function resolveParticipantPickDisplay(args: {
  participantPickId: string | null;
  pickLockedOut: boolean;
  homeId: string | null;
  awayId: string | null;
}): { displayPickId: string | null; lockedOut: boolean } {
  const participantPickId = args.participantPickId?.trim() || null;
  if (!participantPickId) return { displayPickId: null, lockedOut: false };
  const onSide =
    participantPickId === args.homeId || participantPickId === args.awayId;
  if (!onSide) {
    return { displayPickId: participantPickId, lockedOut: true };
  }
  return {
    displayPickId: participantPickId,
    lockedOut: args.pickLockedOut,
  };
}

function slotRowForLaterMatch(
  bracketKind: KnockoutWizardBracketKind,
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft | null {
  const def = knockoutMatchStepDef(bracketKind);
  if (!def || def.resultKind === "champion") return null;
  const slotKey = String(matchIndex + 1);
  return (
    slots.find(
      (s) => s.predictionKind === def.resultKind && s.slotKey === slotKey,
    ) ?? null
  );
}

function buildLiveSide(args: {
  teamId: string | null;
  teamById: Map<string, Team>;
  officialWinnerId: string | null;
  matchFinished: boolean;
  participantPickedWinnerId: string | null;
  savedPickLockedOut: boolean;
  isAutoCarriedPick?: boolean;
  eliminatedTeamIds: Set<string>;
  usesOfficialFixture: boolean;
  siblingHasTeam: boolean;
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

  const fillState = resolveSideFillState({
    teamId,
    usesOfficialFixture: args.usesOfficialFixture,
    siblingHasTeam: args.siblingHasTeam,
  });
  const participantPick = participantPickBadge({
    teamId,
    participantPickedWinnerId: args.participantPickedWinnerId,
    matchFinished: args.matchFinished,
    tournamentOutcome,
    eliminatedFromTournament,
    savedPickLockedOut: args.savedPickLockedOut,
    isAutoCarriedPick: args.isAutoCarriedPick,
  });
  const helperTooltip =
    participantPick === "not_your_pick"
      ? OFFICIAL_ADVANCED_NOT_YOUR_PICK_TOOLTIP
      : fillState === "no_saved_pick"
        ? NO_SAVED_PICK_BRACKET_TOOLTIP
        : null;

  return {
    teamId,
    displayName: sideDisplayName(teamId, args.teamById, fillState),
    countryCode: countryCodeForTeam(teamId, args.teamById),
    tournamentOutcome,
    participantPick,
    eliminatedFromTournament,
    fillState,
    helperTooltip,
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
  let officialHomeId: string | null = null;
  let officialAwayId: string | null = null;
  if (args.officialMatch) {
    officialHomeId = teamIdForCountry(
      args.teamByCountry,
      args.officialMatch.home_country_code,
    );
    officialAwayId = teamIdForCountry(
      args.teamByCountry,
      args.officialMatch.away_country_code,
    );
  }
  const homeId = officialHomeId ?? args.participantHomeId;
  const awayId = officialAwayId ?? args.participantAwayId;
  const usesOfficialFixture = Boolean(officialHomeId || officialAwayId);
  return { homeId, awayId, usesOfficialFixture };
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
  participantSavedPickLockedOut?: boolean;
  isAutoCarriedPick?: boolean;
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

  const { displayPickId, lockedOut } = resolveParticipantPickDisplay({
    participantPickId: args.participantPickedWinnerId,
    pickLockedOut: Boolean(args.participantSavedPickLockedOut),
    homeId,
    awayId,
  });

  const sideArgs = {
    teamById: args.teamById,
    officialWinnerId,
    matchFinished,
    participantPickedWinnerId: displayPickId,
    savedPickLockedOut: lockedOut,
    isAutoCarriedPick: args.isAutoCarriedPick,
    eliminatedTeamIds: args.eliminatedTeamIds,
    usesOfficialFixture,
  };

  return {
    matchKey: args.matchKey,
    fifaMatchNo: args.fifaMatchNo,
    stageCode: args.stageCode,
    stageLabel: args.stageLabel,
    status,
    scoreLine: pub ? formatTournamentMatchScoreLine(pub) : null,
    statusLabel: statusLabelForMatch(status, pub),
    usesOfficialFixture,
    participantPickedWinnerId: displayPickId,
    isAutoCarriedPick: args.isAutoCarriedPick,
    home: buildLiveSide({
      teamId: homeId,
      siblingHasTeam: Boolean(awayId),
      ...sideArgs,
    }),
    away: buildLiveSide({
      teamId: awayId,
      siblingHasTeam: Boolean(homeId),
      ...sideArgs,
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

    return buildLiveMatchFromFixture({
      matchKey: `M${def.fifaMatchNo}`,
      fifaMatchNo: def.fifaMatchNo,
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      officialMatch: pub,
      participantHomeId: topId,
      participantAwayId: bottomId,
      participantPickedWinnerId: participantPick,
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
    const participantPick = validatedKnockoutMatchWinner(row);
    const pickLockedOut = isKnockoutPickLockedOut({
      pickStatus: row.pickStatus,
      teamId: row.winnerTeamId,
    });
    const { displayPickId, lockedOut } = resolveParticipantPickDisplay({
      participantPickId: participantPick,
      pickLockedOut,
      homeId: row.homeTeamId,
      awayId: row.awayTeamId,
    });
    const isAutoCarriedPick =
      Boolean(displayPickId) &&
      !row.winnerTeamId.trim() &&
      row.autoCarriedPick?.status === "inferred_live";

    return buildLiveMatchFromFixture({
      matchKey: row.fifaMatchNo > 0 ? `M${row.fifaMatchNo}` : row.rowKey,
      fifaMatchNo: row.fifaMatchNo,
      stageCode: def.stageCode,
      stageLabel: def.stageLabel,
      officialMatch: pub,
      participantHomeId: row.homeTeamId,
      participantAwayId: row.awayTeamId,
      participantPickedWinnerId: displayPickId,
      participantSavedPickLockedOut: lockedOut,
      isAutoCarriedPick,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    });
  });
}

function pickTeamId(
  slots: KnockoutPickSlotDraft[],
  kind: KnockoutPickSlotDraft["predictionKind"],
  slotKey: string,
): string | null {
  const row =
    slots.find((s) => s.predictionKind === kind && s.slotKey === slotKey) ??
    null;
  if (!row?.teamId.trim() || isKnockoutPickLockedOut(row)) return null;
  return row.teamId.trim();
}

function participantPathForLaterMatch(
  bracketKind: KnockoutWizardBracketKind,
  matchIndex: number,
  slots: KnockoutPickSlotDraft[],
  ctx: ConfirmedR32WinnerContext,
): {
  homeId: string | null;
  awayId: string | null;
  pickId: string | null;
} {
  const def = knockoutMatchStepDef(bracketKind);
  if (!def) return { homeId: null, awayId: null, pickId: null };

  const saveSlotKey = def.resultKind === "champion" ? null : String(matchIndex + 1);
  const pickId =
    def.resultKind === "champion"
      ? (slots.find((s) => s.predictionKind === "champion")?.teamId.trim() || null)
      : saveSlotKey
        ? pickTeamId(slots, def.resultKind, saveSlotKey)
        : null;

  if (bracketKind === "round_of_16") {
    const pair = r16R32ParticipantPair(matchIndex);
    if (!pair) return { homeId: null, awayId: null, pickId };
    const [homeR32, awayR32] = pair;
    return {
      homeId: readConfirmedR32MatchWinner(homeR32, slots, ctx) || null,
      awayId: readConfirmedR32MatchWinner(awayR32, slots, ctx) || null,
      pickId,
    };
  }

  const { homeTeamId, awayTeamId } = storedFeederSideTeamIdsForMatch(
    bracketKind,
    matchIndex,
    slots,
  );
  return {
    homeId: homeTeamId,
    awayId: awayTeamId,
    pickId,
  };
}

function hasAnyKnockoutProgressionPick(slots: KnockoutPickSlotDraft[]): boolean {
  return slots.some(
    (s) => isKnockoutProgressionKind(s.predictionKind) && s.teamId.trim() !== "",
  );
}

function officialFixtureTeamIds(
  pub: TournamentMatchPublicRow | null,
  teamByCountry: Map<string, Team>,
): { homeId: string | null; awayId: string | null } {
  if (!pub) return { homeId: null, awayId: null };
  const homeId = teamIdForCountry(teamByCountry, pub.home_country_code);
  const awayId = teamIdForCountry(teamByCountry, pub.away_country_code);
  if (!homeId && !awayId) return { homeId: null, awayId: null };
  return { homeId, awayId };
}

function livePickShowsWrongPath(live: LiveBracketMatch): boolean {
  return (
    live.home.participantPick === "your_pick_wrong_path" ||
    live.away.participantPick === "your_pick_wrong_path"
  );
}

function enrichR32Matches(
  liveMatches: LiveBracketMatch[],
  participantMatches: BracketMatchResolved[],
  slots: KnockoutPickSlotDraft[],
  ctx: ConfirmedR32WinnerContext,
  teamById: Map<string, Team>,
  teamByCountry: Map<string, Team>,
  eliminatedTeamIds: Set<string>,
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
): LiveBracketMatch[] {
  return liveMatches.map((live, index) => {
    const participant = participantMatches[index];
    const pub = r32PublicMatchForIndex(tournamentMatches, index);
    const officialSides = officialFixtureTeamIds(pub, teamByCountry);
    const { topId, bottomId } = officialR32ParticipantIds(index, slots, ctx);

    const homeId =
      officialSides.homeId ??
      live.home.teamId ??
      topId ??
      participant?.home.teamId ??
      null;
    const awayId =
      officialSides.awayId ??
      live.away.teamId ??
      bottomId ??
      participant?.away.teamId ??
      null;
    const participantPick =
      readParticipantR32MatchWinnerPick(index, slots, ctx) || null;
    const r32Slot = slots.find((s) => s.rowKey === `round_of_32|${index + 1}`);
    const pickLockedOut = r32Slot ? isKnockoutPickLockedOut(r32Slot) : false;
    const { displayPickId, lockedOut } = resolveParticipantPickDisplay({
      participantPickId: participantPick,
      pickLockedOut,
      homeId,
      awayId,
    });

    if (
      homeId === live.home.teamId &&
      awayId === live.away.teamId &&
      displayPickId === live.participantPickedWinnerId &&
      lockedOut === livePickShowsWrongPath(live)
    ) {
      return live;
    }

    return buildLiveMatchFromFixture({
      matchKey: live.matchKey,
      fifaMatchNo: live.fifaMatchNo,
      stageCode: live.stageCode,
      stageLabel: live.stageLabel,
      officialMatch: pub,
      participantHomeId: homeId,
      participantAwayId: awayId,
      participantPickedWinnerId: displayPickId,
      participantSavedPickLockedOut: lockedOut,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    });
  });
}

function enrichLiveRound(
  liveMatches: LiveBracketMatch[],
  participantMatches: BracketMatchResolved[],
  bracketKind: KnockoutWizardBracketKind,
  slots: KnockoutPickSlotDraft[],
  ctx: ConfirmedR32WinnerContext,
  teamById: Map<string, Team>,
  teamByCountry: Map<string, Team>,
  eliminatedTeamIds: Set<string>,
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined,
): LiveBracketMatch[] {
  return liveMatches.map((live, index) => {
    const participant = participantMatches[index];
    const pathFallback = participantPathForLaterMatch(
      bracketKind,
      index,
      slots,
      ctx,
    );

    const stageMatches = (tournamentMatches ?? []).filter(
      (m) => m.stage_code === live.stageCode,
    );
    const pub = publicMatchForFifaNo(stageMatches, live.stageCode, live.fifaMatchNo);
    const officialSides = officialFixtureTeamIds(pub, teamByCountry);

    const homeId =
      officialSides.homeId ??
      live.home.teamId ??
      pathFallback.homeId ??
      participant?.home.teamId ??
      null;
    const awayId =
      officialSides.awayId ??
      live.away.teamId ??
      pathFallback.awayId ??
      participant?.away.teamId ??
      null;
    const slotRow = slotRowForLaterMatch(bracketKind, index, slots);
    const pickLockedOut = slotRow ? isKnockoutPickLockedOut(slotRow) : false;
    const lockedOutSavedPickId =
      pickLockedOut && slotRow?.teamId.trim() ? slotRow.teamId.trim() : null;
    const participantPick =
      live.participantPickedWinnerId ??
      (participant?.winnerTeamId &&
      (participant.winnerTeamId === homeId || participant.winnerTeamId === awayId)
        ? participant.winnerTeamId
        : null) ??
      (pathFallback.pickId &&
      (pathFallback.pickId === homeId || pathFallback.pickId === awayId)
        ? pathFallback.pickId
        : null) ??
      (lockedOutSavedPickId &&
      (lockedOutSavedPickId === homeId || lockedOutSavedPickId === awayId)
        ? lockedOutSavedPickId
        : null) ??
      null;
    const { displayPickId, lockedOut } = resolveParticipantPickDisplay({
      participantPickId: participantPick,
      pickLockedOut,
      homeId,
      awayId,
    });
    const isAutoCarriedPick =
      Boolean(live.isAutoCarriedPick) &&
      Boolean(displayPickId) &&
      !(slotRow?.teamId.trim());

    if (
      homeId === live.home.teamId &&
      awayId === live.away.teamId &&
      displayPickId === live.participantPickedWinnerId &&
      lockedOut === livePickShowsWrongPath(live) &&
      isAutoCarriedPick === Boolean(live.isAutoCarriedPick)
    ) {
      return live;
    }

    return buildLiveMatchFromFixture({
      matchKey: live.matchKey,
      fifaMatchNo: live.fifaMatchNo,
      stageCode: live.stageCode,
      stageLabel: live.stageLabel,
      officialMatch: pub,
      participantHomeId: homeId,
      participantAwayId: awayId,
      participantPickedWinnerId: displayPickId,
      participantSavedPickLockedOut: lockedOut,
      isAutoCarriedPick,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    });
  });
}

export function buildLiveBracketTracker(
  input: BuildLiveBracketTrackerInput,
): LiveBracketTrackerModel {
  const fullBracketUnlocked = resolveFullBracketUnlockedForTracker(input);
  const trackerInput: BuildLiveBracketTrackerInput = {
    ...input,
    knockoutBracketPicksUnlocked: fullBracketUnlocked,
  };

  const participantBracket = deriveParticipantBracket({
    slots: input.slots,
    teams: input.teams,
    knockoutBracketPicksUnlocked: fullBracketUnlocked,
  });

  const { teamById, teamByCountry } = teamByMaps(input.teams);
  const eliminatedTeamIds = buildEliminatedTeamIdSet(
    input.tournamentMatches,
    input.teams,
  );
  const gradual = getGradualKnockoutSelectionState({
    matches: input.tournamentMatches ?? null,
    fullRoundOf32Official: fullBracketUnlocked,
  });

  const pathCtx = r32Ctx(trackerInput, gradual);
  const champRow = input.slots.find((s) => s.predictionKind === "champion");
  const champId = champRow?.teamId.trim() || null;
  const finalMatches = enrichLiveRound(
    buildLaterRoundMatches(
      "finalist",
      trackerInput,
      gradual,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
    ),
    participantBracket.final,
    "finalist",
    input.slots,
    pathCtx,
    teamById,
    teamByCountry,
    eliminatedTeamIds,
    input.tournamentMatches,
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
  const champSlotRow = input.slots.find((s) => s.predictionKind === "champion");
  const championPickBadge = participantPickBadge({
    teamId: champId,
    participantPickedWinnerId: champId,
    matchFinished: finalFinished,
    tournamentOutcome: championTournamentOutcome,
    eliminatedFromTournament: championEliminated,
    savedPickLockedOut: champSlotRow ? isKnockoutPickLockedOut(champSlotRow) : false,
  });

  const hasSavedChampionPick = Boolean(champId);
  const showChampionCard = hasAnyKnockoutProgressionPick(input.slots);
  const finalHasFeederTeams = Boolean(
    finalMatch &&
      (finalMatch.home.teamId?.trim() || finalMatch.away.teamId?.trim()),
  );
  const finalHelperCopy =
    finalHasFeederTeams && !hasSavedChampionPick
      ? FINAL_FEEDER_NO_CHAMPION_HELPER
      : null;

  return {
    roundOf32: enrichR32Matches(
      buildR32Matches(
        trackerInput,
        gradual,
        teamById,
        teamByCountry,
        eliminatedTeamIds,
      ),
      participantBracket.roundOf32,
      input.slots,
      pathCtx,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
      input.tournamentMatches,
    ),
    roundOf16: enrichLiveRound(
      buildLaterRoundMatches(
        "round_of_16",
        trackerInput,
        gradual,
        teamById,
        teamByCountry,
        eliminatedTeamIds,
      ),
      participantBracket.roundOf16,
      "round_of_16",
      input.slots,
      pathCtx,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
      input.tournamentMatches,
    ),
    quarterfinals: enrichLiveRound(
      buildLaterRoundMatches(
        "quarterfinalist",
        trackerInput,
        gradual,
        teamById,
        teamByCountry,
        eliminatedTeamIds,
      ),
      participantBracket.quarterfinals,
      "quarterfinalist",
      input.slots,
      pathCtx,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
      input.tournamentMatches,
    ),
    semifinals: enrichLiveRound(
      buildLaterRoundMatches(
        "semifinalist",
        trackerInput,
        gradual,
        teamById,
        teamByCountry,
        eliminatedTeamIds,
      ),
      participantBracket.semifinals,
      "semifinalist",
      input.slots,
      pathCtx,
      teamById,
      teamByCountry,
      eliminatedTeamIds,
      input.tournamentMatches,
    ),
    final: finalMatches,
    champion: {
      teamId: champId,
      displayName: hasSavedChampionPick
        ? teamLabel(champId, teamById, "Unknown team")
        : NO_CHAMPION_PICK_SAVED_LABEL,
      countryCode: countryCodeForTeam(champId, teamById),
      hasSavedPick: hasSavedChampionPick,
      emptyLabel: NO_CHAMPION_PICK_SAVED_LABEL,
      participantPick: Boolean(champId),
      eliminatedFromTournament: championEliminated,
      participantPickBadge: championPickBadge,
      tournamentOutcome: championTournamentOutcome,
    },
    finalHelperCopy,
    showChampionCard,
    eliminatedTeamIds,
  };
}
