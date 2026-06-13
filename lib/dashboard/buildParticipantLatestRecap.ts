import {
  buildTeamImportanceById,
  importanceScoreForKind,
  participantHasAnyPick,
  reasonForTeamPick,
} from "../account/buildWhoToCheerFor";
import { countryCodesFromKnockoutSlots } from "../participant/nextMatchesForPickedTeams";
import {
  formatTournamentMatchScoreLine,
  isFinishedMatchWithScores,
} from "../tournament/matchScoreDisplay";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { PredictionKind, Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

/** Legacy display limit; recap selection scans all completed matches by default. */
export const RECAP_MATCH_LIMIT = 3;

export type RecapImpact = "helped" | "mixed" | "hurt" | "neutral";

export type ParticipantRecapRankMovement = {
  previousRank: number;
  newRank: number;
};

export type ParticipantRecapMatchItem = {
  matchId: string;
  matchCode: string;
  kickoffAt: string | null;
  stageLabel: string;
  groupCode: string | null;
  scoreLine: string;
  match: TournamentMatchPublicRow;
  impact: RecapImpact;
  explanation: string;
  /** Set only when score-impact activity ties points to this match for the viewer. */
  pointsEarned: number | null;
  /**
   * Rank before/after a scored update. Not populated yet — historical rank snapshots
   * are not exposed to participants. Wire from score-impact or standings history when available.
   */
  rankMovement: ParticipantRecapRankMovement | null;
  hasRelevantPick: boolean;
};

export type ParticipantLatestRecapVariant = "matches" | "compact_neutral";

export type ParticipantLatestRecap = {
  showCard: boolean;
  variant: ParticipantLatestRecapVariant;
  items: ParticipantRecapMatchItem[];
};

export type BuildParticipantLatestRecapInput = {
  matches: TournamentMatchPublicRow[];
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  /** Points earned per match_code from pool score-impact activity, when known. */
  pointsByMatchCode?: ReadonlyMap<string, number>;
  limit?: number;
};

type MatchOutcome = "won" | "drew" | "lost";

type PickSentiment = "positive" | "negative" | "neutral";

type RelevantPickAssessment = {
  slot: KnockoutPickSlotDraft;
  teamId: string;
  teamName: string;
  sentiment: PickSentiment;
};

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

function kickoffSortKey(iso: string | null | undefined): number {
  if (iso == null || iso === "") return Number.NEGATIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function recentCompletedOfficialMatches(
  matches: TournamentMatchPublicRow[],
  limit?: number,
): TournamentMatchPublicRow[] {
  const sorted = [...matches]
    .filter(isFinishedMatchWithScores)
    .sort((a, b) => kickoffSortKey(b.kickoff_at) - kickoffSortKey(a.kickoff_at));
  return limit != null ? sorted.slice(0, limit) : sorted;
}

function recapImpactTier(impact: RecapImpact): number {
  if (impact === "helped" || impact === "hurt" || impact === "mixed") return 0;
  return 1;
}

/** Pick one recap: helped/hurt/mixed before neutral, then most recent kickoff, then match code. */
export function selectBestRecapItem(
  items: ParticipantRecapMatchItem[],
): ParticipantRecapMatchItem | null {
  if (items.length === 0) return null;

  return [...items].sort((a, b) => {
    const tierDiff = recapImpactTier(a.impact) - recapImpactTier(b.impact);
    if (tierDiff !== 0) return tierDiff;

    const kickDiff = kickoffSortKey(b.kickoffAt) - kickoffSortKey(a.kickoffAt);
    if (kickDiff !== 0) return kickDiff;

    const codeDiff = a.matchCode.localeCompare(b.matchCode);
    if (codeDiff !== 0) return codeDiff;

    return a.matchId.localeCompare(b.matchId);
  })[0]!;
}

function teamNameForId(teamId: string, teamById: Map<string, Team>): string {
  const t = teamById.get(teamId);
  return t?.name?.trim() || "your pick";
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

function isKnockoutStageMatch(m: TournamentMatchPublicRow): boolean {
  return m.stage_code !== "group";
}

function sentimentForRelevantPick(
  slot: KnockoutPickSlotDraft,
  outcome: MatchOutcome,
  m: TournamentMatchPublicRow,
): PickSentiment {
  const kind = slot.predictionKind;

  if (kind === "bonus_pick") return "neutral";

  if (
    kind === "group_winner" ||
    kind === "group_runner_up" ||
    kind === "third_place_qualifier"
  ) {
    if (m.stage_code !== "group") return "neutral";
    if (outcome === "won") return "positive";
    if (outcome === "drew") return "neutral";
    if (kind === "third_place_qualifier") return "neutral";
    return "negative";
  }

  if (isKnockoutStageMatch(m)) {
    if (outcome === "won") return "positive";
    if (outcome === "lost") return "negative";
    return "neutral";
  }

  return "neutral";
}

function groupLabel(slot: KnockoutPickSlotDraft, m: TournamentMatchPublicRow): string | null {
  const g = slot.groupCode ?? m.group_code;
  if (!g) return null;
  return g.trim().toUpperCase();
}

function explanationForPrimaryPick(
  assessment: RelevantPickAssessment,
  m: TournamentMatchPublicRow,
  impact: RecapImpact,
): string {
  const { slot, teamName, sentiment } = assessment;
  const kind = slot.predictionKind;
  const group = groupLabel(slot, m);

  if (impact === "neutral" || sentiment === "neutral") {
    if (kind === "third_place_qualifier") {
      return `You picked ${teamName} as a third-place qualifier. This result keeps that path alive.`;
    }
    return "No direct impact on your bracket.";
  }

  if (impact === "mixed") {
    return "Mixed result: one of your picked teams gained points, but this may hurt your group order.";
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

  if (isKnockoutStageMatch(m)) {
    const verb = impact === "helped" ? "helped" : "hurt";
    return `${reasonForTeamPick(teamName, {
      score: importanceScoreForKind(kind),
      kind,
    })} This result ${verb} your bracket.`;
  }

  const verb = impact === "helped" ? "helped" : "hurt";
  return `You picked ${teamName} in your bracket. This result ${verb} your bracket.`;
}

function aggregateImpact(sentiments: PickSentiment[]): RecapImpact {
  const material = sentiments.filter((s) => s !== "neutral");
  if (material.length === 0) return "neutral";
  const hasPositive = material.some((s) => s === "positive");
  const hasNegative = material.some((s) => s === "negative");
  if (hasPositive && hasNegative) return "mixed";
  if (hasPositive) return "helped";
  if (hasNegative) return "hurt";
  return "neutral";
}

function findRelevantPickAssessments(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teamById: Map<string, Team>,
  teamByCountry: Map<string, Team>,
): RelevantPickAssessment[] {
  const homeCode = normCode(m.home_country_code);
  const awayCode = normCode(m.away_country_code);
  const involvedTeamIds = new Set<string>();

  for (const code of [homeCode, awayCode]) {
    if (!code) continue;
    const team = teamByCountry.get(code);
    if (team?.id) involvedTeamIds.add(team.id);
  }

  const out: RelevantPickAssessment[] = [];
  for (const slot of slots) {
    const teamId = slot.teamId.trim();
    if (!teamId || !involvedTeamIds.has(teamId)) continue;

    const team = teamById.get(teamId);
    const code = normCode(team?.countryCode);
    if (!code) continue;

    const outcome = outcomeForCountryCode(code, m);
    if (!outcome) continue;

    out.push({
      slot,
      teamId,
      teamName: teamNameForId(teamId, teamById),
      sentiment: sentimentForRelevantPick(slot, outcome, m),
    });
  }

  return out;
}

function pickPrimaryAssessment(
  assessments: RelevantPickAssessment[],
  importanceByTeamId: Map<string, { score: number; kind: PredictionKind }>,
): RelevantPickAssessment | null {
  if (assessments.length === 0) return null;
  return [...assessments].sort((a, b) => {
    const ai = importanceByTeamId.get(a.teamId)?.score ?? 0;
    const bi = importanceByTeamId.get(b.teamId)?.score ?? 0;
    return bi - ai;
  })[0]!;
}

export function buildRecapItemForMatch(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
  pointsByMatchCode?: ReadonlyMap<string, number>,
): ParticipantRecapMatchItem {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamByCountry = new Map<string, Team>();
  for (const t of teams) {
    const code = normCode(t.countryCode);
    if (code) teamByCountry.set(code, t);
  }

  const importanceByTeamId = buildTeamImportanceById(slots);
  const assessments = findRelevantPickAssessments(m, slots, teamById, teamByCountry);
  const hasRelevantPick = assessments.length > 0;
  const impact = aggregateImpact(assessments.map((a) => a.sentiment));
  const primary = pickPrimaryAssessment(assessments, importanceByTeamId);

  const explanation = primary
    ? explanationForPrimaryPick(primary, m, impact)
    : "No direct impact on your bracket.";

  const rawPoints = pointsByMatchCode?.get(m.match_code);
  const pointsEarned =
    rawPoints != null && rawPoints > 0 ? rawPoints : null;

  return {
    matchId: m.match_id,
    matchCode: m.match_code,
    kickoffAt: m.kickoff_at,
    stageLabel: m.stage_label,
    groupCode: m.group_code,
    scoreLine: formatTournamentMatchScoreLine(m),
    match: m,
    impact,
    explanation,
    pointsEarned,
    rankMovement: null,
    hasRelevantPick,
  };
}

export function buildParticipantLatestRecap(
  input: BuildParticipantLatestRecapInput,
): ParticipantLatestRecap {
  if (!participantHasAnyPick(input.slots)) {
    return { showCard: false, variant: "matches", items: [] };
  }

  const recent = recentCompletedOfficialMatches(input.matches, input.limit);

  if (recent.length === 0) {
    return { showCard: false, variant: "matches", items: [] };
  }

  const candidates = recent.map((m) =>
    buildRecapItemForMatch(m, input.slots, input.teams, input.pointsByMatchCode),
  );

  const anyRelevant = candidates.some((i) => i.hasRelevantPick);
  if (!anyRelevant) {
    return { showCard: true, variant: "compact_neutral", items: [] };
  }

  const selected = selectBestRecapItem(candidates);
  return {
    showCard: selected != null,
    variant: "matches",
    items: selected ? [selected] : [],
  };
}

/** Map match_code → points gained for one participant from score-impact activity rows. */
export function pointsByMatchCodeFromScoreImpactActivities(
  activities: ReadonlyArray<{
    type: string;
    metadata_json: Record<string, unknown>;
  }>,
  participantId: string,
): Map<string, number> {
  const out = new Map<string, number>();

  for (const item of activities) {
    if (item.type !== "ash_score_impact") continue;
    const matchCodes = item.metadata_json.match_codes;
    if (!Array.isArray(matchCodes)) continue;

    const gainers = item.metadata_json.point_gainers;
    if (!Array.isArray(gainers)) continue;

    const row = gainers.find(
      (g) =>
        g != null &&
        typeof g === "object" &&
        (g as { participant_id?: string }).participant_id === participantId,
    ) as { points_gained?: number } | undefined;

    const gained =
      row && typeof row.points_gained === "number" ? row.points_gained : 0;
    if (gained <= 0) continue;

    for (const code of matchCodes) {
      if (typeof code !== "string" || !code.trim()) continue;
      out.set(code, gained);
    }
  }

  return out;
}
