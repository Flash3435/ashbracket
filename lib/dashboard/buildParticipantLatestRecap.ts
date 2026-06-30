import {
  buildTeamImportanceById,
  participantHasAnyPick,
} from "../account/buildWhoToCheerFor";
import {
  buildMatchBracketGuidance,
  groupExplanationForPick,
  groupSentimentForPick,
  type BracketMatchImpact,
} from "../participant/bracketMatchImpact";
import { countryCodesFromKnockoutSlots } from "../participant/nextMatchesForPickedTeams";
import { recapCalendarDateYmdEdmonton } from "../poolActivity/recapCalendarDate";
import {
  formatTournamentMatchScoreLine,
  isFinishedMatchWithScores,
} from "../tournament/matchScoreDisplay";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { PredictionKind, Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

/** Legacy display limit; recap selection scans all completed matches by default. */
export const RECAP_MATCH_LIMIT = 3;

export const LATEST_RECAP_DASHBOARD_LIMIT = 4;

export type RecapImpact = BracketMatchImpact;

export type RecapBadgeKind =
  | "helped"
  | "hurt"
  | "mixed"
  | "no_scoring_yet"
  | "no_strong_angle";

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
  /** e.g. "Yesterday's results and your bracket" */
  matchDaySubtitle: string | null;
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

function kickoffEdmontonYmd(iso: string | null | undefined): string | null {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return recapCalendarDateYmdEdmonton(d);
}

/** User-facing subtitle for the selected recap match day. */
export function formatRecapMatchDaySubtitle(
  matchDayYmd: string,
  nowMs = Date.now(),
): string {
  const todayYmd = recapCalendarDateYmdEdmonton(new Date(nowMs));
  if (matchDayYmd === todayYmd) {
    return "Today's results and your bracket";
  }
  const yesterdayYmd = recapCalendarDateYmdEdmonton(
    new Date(nowMs - 24 * 3600_000),
  );
  if (matchDayYmd === yesterdayYmd) {
    return "Yesterday's results and your bracket";
  }
  return "Recent results and your bracket";
}

export function recapBadgeKind(item: ParticipantRecapMatchItem): RecapBadgeKind {
  if (item.impact === "helped") return "helped";
  if (item.impact === "hurt") return "hurt";
  if (item.impact === "mixed") return "mixed";
  if (item.hasRelevantPick && item.match.stage_code === "group") {
    return "no_scoring_yet";
  }
  return "no_strong_angle";
}

/** True when badge label and explanation describe the same impact tier. */
export function recapBadgeAlignsWithExplanation(item: ParticipantRecapMatchItem): boolean {
  const badge = recapBadgeKind(item);
  const copy = item.explanation.toLowerCase();
  const isNeutralCopy = copy.includes("no strong angle");
  if (badge === "no_strong_angle") return isNeutralCopy;
  if (isNeutralCopy) return false;
  if (badge === "mixed") return item.impact === "mixed";
  return badge === item.impact;
}

export function formatRecapMatchHeadline(m: TournamentMatchPublicRow): string {
  const home = m.home_team_name?.trim() || "TBD";
  const away = m.away_team_name?.trim() || "TBD";
  const score = formatTournamentMatchScoreLine(m);
  if (score === "—") return `${home} vs ${away}`;
  return `${home} ${score} ${away}`;
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

/**
 * Dashboard recap: all completed matches on the most recent Edmonton calendar day
 * with results, newest kickoff first, capped at {@link LATEST_RECAP_DASHBOARD_LIMIT}.
 */
export function selectRecentRecapItemsForDashboard(
  matches: TournamentMatchPublicRow[],
  buildItem: (m: TournamentMatchPublicRow) => ParticipantRecapMatchItem,
  options?: { limit?: number; nowMs?: number },
): { items: ParticipantRecapMatchItem[]; matchDayYmd: string | null } {
  const limit = options?.limit ?? LATEST_RECAP_DASHBOARD_LIMIT;
  const completed = matches.filter(isFinishedMatchWithScores);
  if (completed.length === 0) {
    return { items: [], matchDayYmd: null };
  }

  const daySet = new Set<string>();
  for (const m of completed) {
    const ymd = kickoffEdmontonYmd(m.kickoff_at);
    if (ymd) daySet.add(ymd);
  }
  const latestDay = [...daySet].sort().reverse()[0] ?? null;
  if (!latestDay) {
    return { items: [], matchDayYmd: null };
  }

  const dayMatches = completed
    .filter((m) => kickoffEdmontonYmd(m.kickoff_at) === latestDay)
    .sort((a, b) => kickoffSortKey(b.kickoff_at) - kickoffSortKey(a.kickoff_at))
    .slice(0, limit);

  return {
    items: dayMatches.map(buildItem),
    matchDayYmd: latestDay,
  };
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

function sentimentForRelevantPick(
  slot: KnockoutPickSlotDraft,
  outcome: MatchOutcome,
  m: TournamentMatchPublicRow,
): PickSentiment {
  return groupSentimentForPick(slot, outcome, m);
}

function explanationForPrimaryPick(
  assessment: RelevantPickAssessment,
  m: TournamentMatchPublicRow,
  impact: RecapImpact,
): string {
  return groupExplanationForPick(
    {
      slot: assessment.slot,
      teamName: assessment.teamName,
      sentiment: assessment.sentiment,
    },
    m,
    impact,
  );
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
  allMatches?: TournamentMatchPublicRow[],
): ParticipantRecapMatchItem {
  const schedule = allMatches ?? [m];

  if (m.stage_code !== "group") {
    const guidance = buildMatchBracketGuidance(m, slots, teams, schedule);
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
      impact: guidance.impact,
      explanation: guidance.explanation,
      pointsEarned,
      rankMovement: null,
      hasRelevantPick: guidance.hasRelevantPick,
    };
  }

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

  let explanation = primary
    ? explanationForPrimaryPick(primary, m, impact)
    : "No strong angle for your bracket.";

  if (impact === "mixed" && pointsByMatchCode?.get(m.match_code) == null) {
    explanation = `${explanation} No pool points yet.`;
  }

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
  const empty: ParticipantLatestRecap = {
    showCard: false,
    variant: "matches",
    items: [],
    matchDaySubtitle: null,
  };

  if (!participantHasAnyPick(input.slots)) {
    return empty;
  }

  const { items, matchDayYmd } = selectRecentRecapItemsForDashboard(
    input.matches,
    (m) =>
      buildRecapItemForMatch(
        m,
        input.slots,
        input.teams,
        input.pointsByMatchCode,
        input.matches,
      ),
    { limit: input.limit ?? LATEST_RECAP_DASHBOARD_LIMIT },
  );

  if (items.length === 0) {
    return empty;
  }

  return {
    showCard: true,
    variant: "matches",
    items,
    matchDaySubtitle: matchDayYmd
      ? formatRecapMatchDaySubtitle(matchDayYmd)
      : null,
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
