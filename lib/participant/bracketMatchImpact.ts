import {
  buildTeamImportanceById,
  decideCheerForMatchSides,
  importanceScoreForKind,
  reasonForTeamPick,
  type CheerDecision,
  type CheerTeamSummary,
  type TeamPickImportance,
} from "../account/buildWhoToCheerFor";
import { buildPickHighlightSets } from "./participantPickHighlights";
import { isFinishedMatchWithScores } from "../tournament/matchScoreDisplay";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { PredictionKind, Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type PickSideHighlightKind =
  | "none"
  | "needed"
  | "in_bracket"
  | "eliminated";

export type BracketMatchImpact = "helped" | "mixed" | "hurt" | "neutral";

export type BracketWantsLabel = {
  primary: string;
  muted: boolean;
};

export type MatchBracketGuidance = {
  homeHighlight: PickSideHighlightKind;
  awayHighlight: PickSideHighlightKind;
  wantsLabel: BracketWantsLabel;
  explanation: string;
  impact: BracketMatchImpact;
  /** Team the bracket needed to win, when unambiguous. */
  wantedTeamName: string | null;
  hasRelevantPick: boolean;
};

type MatchOutcome = "won" | "drew" | "lost";

type TeamPathView = {
  teamId: string;
  teamName: string;
  countryCode: string;
  importance: TeamPickImportance | null;
  outcome: MatchOutcome | null;
  eliminated: boolean;
};

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
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

function teamNameForId(teamId: string, teamById: Map<string, Team>): string {
  return teamById.get(teamId)?.name?.trim() || "your pick";
}

function isKnockoutStageMatch(m: TournamentMatchPublicRow): boolean {
  return m.stage_code !== "group";
}

function outcomeForCountryCode(
  code: string,
  m: TournamentMatchPublicRow,
): MatchOutcome | null {
  const home = normCode(m.home_country_code);
  const away = normCode(m.away_country_code);
  const winner = normCode(m.winner_country_code);
  if (code !== home && code !== away) return null;
  if (m.home_goals == null || m.away_goals == null) return null;
  if (m.home_goals === m.away_goals) return "drew";
  if (winner === code) return "won";
  if (winner && winner !== code) return "lost";
  return m.home_goals > m.away_goals
    ? code === home
      ? "won"
      : "lost"
    : code === away
      ? "won"
      : "lost";
}

/** Team ids eliminated by any finished knockout match on the official schedule. */
export function eliminatedTeamIdsFromMatches(
  matches: TournamentMatchPublicRow[],
  teams: Team[],
): Set<string> {
  const { teamByCountry } = teamByMaps(teams);
  const eliminated = new Set<string>();
  for (const m of matches) {
    if (!isKnockoutStageMatch(m) || !isFinishedMatchWithScores(m)) continue;
    const winner = normCode(m.winner_country_code);
    const home = normCode(m.home_country_code);
    const away = normCode(m.away_country_code);
    for (const code of [home, away]) {
      if (!code || code === winner) continue;
      const team = teamByCountry.get(code);
      if (team?.id) eliminated.add(team.id);
    }
  }
  return eliminated;
}

function pathLabelForKind(kind: PredictionKind): string {
  switch (kind) {
    case "champion":
      return "champion pick";
    case "finalist":
      return "final pick";
    case "semifinalist":
      return "semifinal pick";
    case "quarterfinalist":
      return "quarterfinal pick";
    case "round_of_16":
      return "Round of 16 pick";
    case "round_of_32":
      return "Round of 32 pick";
    case "group_winner":
    case "group_runner_up":
      return "group pick";
    case "third_place_qualifier":
      return "third-place pick";
    default:
      return "bracket pick";
  }
}

function pathHelpPhrase(teamName: string, importance: TeamPickImportance): string {
  return `${teamName} helps your ${pathLabelForKind(importance.kind)}`;
}

function alivePhrase(teamName: string, importance: TeamPickImportance): string {
  return `${teamName} advancing keeps your ${pathLabelForKind(importance.kind)} alive`;
}

function eliminatedPhrase(teamName: string, importance: TeamPickImportance | null): string {
  if (importance && importance.kind !== "bonus_pick") {
    return `${teamName} is now eliminated, ending your ${pathLabelForKind(importance.kind)}`;
  }
  return `${teamName} is now eliminated`;
}

function resolveSide(
  m: TournamentMatchPublicRow,
  side: "home" | "away",
  teamByCountry: Map<string, Team>,
): CheerTeamSummary {
  const code = normCode(side === "home" ? m.home_country_code : m.away_country_code);
  const name =
    side === "home" ? m.home_team_name?.trim() : m.away_team_name?.trim();
  const team = code ? teamByCountry.get(code) : undefined;
  return {
    teamId: team?.id ?? null,
    name: team?.name?.trim() || name || "TBD",
    countryCode: code,
  };
}

function highestImportanceForTeam(
  teamId: string,
  importanceByTeamId: Map<string, TeamPickImportance>,
): TeamPickImportance | null {
  return importanceByTeamId.get(teamId) ?? null;
}

function teamPathsInMatch(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  eliminatedTeamIds: Set<string>,
): TeamPathView[] {
  const { teamById, teamByCountry } = teamByMaps(teams);
  const importanceByTeamId = buildTeamImportanceById(slots);
  const { all } = buildPickHighlightSets(m, slots, teamById);
  const out: TeamPathView[] = [];

  for (const side of ["home", "away"] as const) {
    const code = normCode(side === "home" ? m.home_country_code : m.away_country_code);
    if (!code || !all.has(code)) continue;
    const team = teamByCountry.get(code);
    if (!team?.id) continue;
    const outcome = outcomeForCountryCode(code, m);
    out.push({
      teamId: team.id,
      teamName: teamNameForId(team.id, teamById),
      countryCode: code,
      importance: highestImportanceForTeam(team.id, importanceByTeamId),
      outcome,
      eliminated: eliminatedTeamIds.has(team.id) || outcome === "lost",
    });
  }
  return out;
}

function aggregateImpact(helped: boolean, hurt: boolean): BracketMatchImpact {
  if (helped && hurt) return "mixed";
  if (helped) return "helped";
  if (hurt) return "hurt";
  return "neutral";
}

function wantsLabelFromImpact(
  impact: BracketMatchImpact,
  wantedTeamName: string | null,
  isMixedUpcoming: boolean,
): BracketWantsLabel {
  if (isMixedUpcoming) {
    return { primary: "Mixed impact", muted: false };
  }
  if (impact === "neutral" || !wantedTeamName) {
    return { primary: "No strong angle", muted: true };
  }
  if (impact === "mixed") {
    return { primary: "Mixed impact", muted: false };
  }
  return { primary: wantedTeamName, muted: false };
}

function sideHighlightForUpcoming(
  side: CheerTeamSummary,
  codesInBracket: Set<string>,
  neededTeamId: string | null,
  eliminatedTeamIds: Set<string>,
): PickSideHighlightKind {
  const code = side.countryCode;
  if (!code || !codesInBracket.has(code)) return "none";
  if (side.teamId && eliminatedTeamIds.has(side.teamId)) return "eliminated";
  if (neededTeamId && side.teamId === neededTeamId) return "needed";
  return "in_bracket";
}

function sideHighlightForCompleted(
  side: CheerTeamSummary,
  codesInBracket: Set<string>,
  eliminatedTeamIds: Set<string>,
  m: TournamentMatchPublicRow,
): PickSideHighlightKind {
  const code = side.countryCode;
  if (!code || !codesInBracket.has(code)) return "none";
  const outcome = outcomeForCountryCode(code, m);
  if (
    (side.teamId && eliminatedTeamIds.has(side.teamId)) ||
    outcome === "lost"
  ) {
    return "eliminated";
  }
  return "in_bracket";
}

function buildCompletedKnockoutExplanation(paths: TeamPathView[]): {
  explanation: string;
  impact: BracketMatchImpact;
  wantedTeamName: string | null;
} {
  const helpedPaths = paths.filter(
    (p) => p.outcome === "won" && p.importance && !p.eliminated,
  );
  const hurtPaths = paths.filter(
    (p) => p.eliminated && p.importance && p.importance.kind !== "bonus_pick",
  );

  const impact = aggregateImpact(helpedPaths.length > 0, hurtPaths.length > 0);
  const parts: string[] = [];

  for (const p of helpedPaths) {
    if (p.importance) parts.push(alivePhrase(p.teamName, p.importance));
  }
  for (const p of hurtPaths) {
    parts.push(eliminatedPhrase(p.teamName, p.importance));
  }

  let explanation: string;
  if (parts.length > 0) {
    explanation = `${parts.join(". ")}.`;
  } else if (paths.length === 0) {
    explanation = "No strong angle for your bracket.";
  } else {
    explanation = "No strong angle for your bracket.";
  }

  if (impact === "hurt" && hurtPaths.length === 1 && helpedPaths.length === 0) {
    explanation = `${hurtPaths[0]!.teamName} was eliminated, so this hurts your bracket.`;
  }

  const wantedTeamName =
    impact === "helped" && helpedPaths[0]
      ? helpedPaths[0].teamName
      : impact === "hurt" && hurtPaths[0]
        ? hurtPaths[0].teamName
        : impact === "mixed" && helpedPaths[0]
          ? helpedPaths[0].teamName
          : null;

  return { explanation, impact, wantedTeamName };
}

function buildUpcomingKnockoutExplanation(
  home: CheerTeamSummary,
  away: CheerTeamSummary,
  decision: CheerDecision,
  importanceByTeamId: Map<string, TeamPickImportance>,
): {
  explanation: string;
  impact: BracketMatchImpact;
  wantedTeamName: string | null;
  isMixedUpcoming: boolean;
} {
  const homeImp = home.teamId ? importanceByTeamId.get(home.teamId) : undefined;
  const awayImp = away.teamId ? importanceByTeamId.get(away.teamId) : undefined;
  const isMixedUpcoming = decision.cheerForLabel === "Both teams are in your bracket";

  if (decision.confidence === "none") {
    return {
      explanation: decision.reason,
      impact: "neutral",
      wantedTeamName: null,
      isMixedUpcoming: false,
    };
  }

  if (isMixedUpcoming && homeImp && awayImp) {
    return {
      explanation: `${pathHelpPhrase(home.name, homeImp)}; ${pathHelpPhrase(away.name, awayImp)}.`,
      impact: "mixed",
      wantedTeamName: null,
      isMixedUpcoming: true,
    };
  }

  const wantedTeamName = decision.cheerForTeamId
    ? decision.cheerForTeamId === home.teamId
      ? home.name
      : away.name
    : null;

  return {
    explanation: decision.reason,
    impact: wantedTeamName ? "helped" : "neutral",
    wantedTeamName,
    isMixedUpcoming: false,
  };
}

export function buildMatchBracketGuidance(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  allMatches: TournamentMatchPublicRow[],
): MatchBracketGuidance {
  const { teamById, teamByCountry } = teamByMaps(teams);
  const eliminatedTeamIds = eliminatedTeamIdsFromMatches(allMatches, teams);
  const importanceByTeamId = buildTeamImportanceById(slots);
  const { all: codesInBracket } = buildPickHighlightSets(m, slots, teamById);
  const home = resolveSide(m, "home", teamByCountry);
  const away = resolveSide(m, "away", teamByCountry);
  const hasRelevantPick = codesInBracket.size > 0;

  if (!isKnockoutStageMatch(m)) {
    const decision = decideCheerForMatchSides(home, away, importanceByTeamId);
    const wantedTeamName =
      decision.cheerForTeamId === home.teamId
        ? home.name
        : decision.cheerForTeamId === away.teamId
          ? away.name
          : null;
    const isMixed = decision.cheerForLabel === "Both teams are in your bracket";
    return {
      homeHighlight: sideHighlightForUpcoming(
        home,
        codesInBracket,
        decision.cheerForTeamId,
        eliminatedTeamIds,
      ),
      awayHighlight: sideHighlightForUpcoming(
        away,
        codesInBracket,
        decision.cheerForTeamId,
        eliminatedTeamIds,
      ),
      wantsLabel: wantsLabelFromImpact(
        isMixed ? "mixed" : decision.confidence === "none" ? "neutral" : "helped",
        wantedTeamName,
        isMixed,
      ),
      explanation: decision.reason,
      impact: isMixed ? "mixed" : decision.confidence === "none" ? "neutral" : "helped",
      wantedTeamName,
      hasRelevantPick,
    };
  }

  if (isFinishedMatchWithScores(m)) {
    const paths = teamPathsInMatch(m, slots, teams, eliminatedTeamIds);
    const { explanation, impact, wantedTeamName } =
      buildCompletedKnockoutExplanation(paths);

    return {
      homeHighlight: sideHighlightForCompleted(
        home,
        codesInBracket,
        eliminatedTeamIds,
        m,
      ),
      awayHighlight: sideHighlightForCompleted(
        away,
        codesInBracket,
        eliminatedTeamIds,
        m,
      ),
      wantsLabel: wantsLabelFromImpact(impact, wantedTeamName, false),
      explanation,
      impact,
      wantedTeamName,
      hasRelevantPick: paths.length > 0,
    };
  }

  const decision = decideCheerForMatchSides(home, away, importanceByTeamId);
  const upcoming = buildUpcomingKnockoutExplanation(
    home,
    away,
    decision,
    importanceByTeamId,
  );

  return {
    homeHighlight: sideHighlightForUpcoming(
      home,
      codesInBracket,
      decision.cheerForTeamId,
      eliminatedTeamIds,
    ),
    awayHighlight: sideHighlightForUpcoming(
      away,
      codesInBracket,
      decision.cheerForTeamId,
      eliminatedTeamIds,
    ),
    wantsLabel: wantsLabelFromImpact(
      upcoming.impact,
      upcoming.wantedTeamName,
      upcoming.isMixedUpcoming,
    ),
    explanation: upcoming.explanation,
    impact: upcoming.impact,
    wantedTeamName: upcoming.wantedTeamName,
    hasRelevantPick,
  };
}

export function pickSideHighlightForMatch(
  m: TournamentMatchPublicRow,
  side: "home" | "away",
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  allMatches: TournamentMatchPublicRow[],
): PickSideHighlightKind {
  const guidance = buildMatchBracketGuidance(m, slots, teams, allMatches);
  return side === "home" ? guidance.homeHighlight : guidance.awayHighlight;
}

export function matchdayBracketWantsFromGuidance(
  guidance: MatchBracketGuidance,
): BracketWantsLabel {
  return guidance.wantsLabel;
}

/** Group-stage recap sentiment (unchanged rules). */
export type GroupPickSentiment = "positive" | "negative" | "neutral";

export function groupSentimentForPick(
  slot: KnockoutPickSlotDraft,
  outcome: MatchOutcome,
  m: TournamentMatchPublicRow,
): GroupPickSentiment {
  const kind = slot.predictionKind;
  if (kind === "bonus_pick") return "neutral";
  if (m.stage_code !== "group") return "neutral";
  if (outcome === "won") return "positive";
  if (outcome === "drew") return "neutral";
  if (kind === "third_place_qualifier") return "neutral";
  return "negative";
}

export function groupExplanationForPick(
  assessment: {
    slot: KnockoutPickSlotDraft;
    teamName: string;
    sentiment: GroupPickSentiment;
  },
  m: TournamentMatchPublicRow,
  impact: BracketMatchImpact,
): string {
  const { slot, teamName, sentiment } = assessment;
  const kind = slot.predictionKind;
  const group = (slot.groupCode ?? m.group_code)?.trim().toUpperCase();

  if (impact === "neutral" || sentiment === "neutral") {
    if (kind === "third_place_qualifier") {
      return `You picked ${teamName} as a third-place qualifier. This result keeps that path alive.`;
    }
    if (m.stage_code === "group" && group) {
      return `No pool points yet — Group ${group} points settle after the group finishes.`;
    }
    return "No strong angle for your bracket.";
  }

  if (kind === "group_winner" && group) {
    const verb = impact === "helped" ? "helped" : "hurt";
    return `You picked ${teamName} to win Group ${group}. This result ${verb} your bracket.`;
  }

  if (kind === "group_runner_up" && group) {
    const verb = impact === "helped" ? "helped" : "hurt";
    return `You picked ${teamName} as Group ${group} runner-up. This result ${verb} your bracket.`;
  }

  if (kind === "third_place_qualifier") {
    if (sentiment === "positive") {
      return `You picked ${teamName} as a third-place qualifier. This result helped your bracket.`;
    }
    return `You picked ${teamName} as a third-place qualifier. This result keeps that path alive.`;
  }

  const verb = impact === "helped" ? "helped" : "hurt";
  return `You picked ${teamName} in your bracket. This result ${verb} your bracket.`;
}

export { importanceScoreForKind, reasonForTeamPick, pathLabelForKind };
