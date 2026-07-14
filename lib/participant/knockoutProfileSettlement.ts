/**
 * Once-per-team knockout settlement helpers for participant profile presentation.
 * Does not write scores or ledger rows — classify cards from official results + matches.
 */
import {
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS,
  isKnockoutProgressionKind,
  type KnockoutProgressionPredictionKind,
} from "../predictions/knockoutProgressionKinds";

export type KnockoutTeamProgress = {
  teamId: string;
  furthestOfficialKind: KnockoutProgressionPredictionKind | null;
  /** Lost a finished knockout match (or never entered a completed R32 field). */
  eliminated: boolean;
  /** Appeared as home/away on an official Round of 32 match. */
  inRoundOf32Field: boolean;
};

export type KnockoutTeamAward = {
  teamId: string;
  representativePredictionId: string;
  points: number;
  resultKind: string;
};

export type KnockoutProfileSettlementContext = {
  progressByTeamId: ReadonlyMap<string, KnockoutTeamProgress>;
  awardByTeamId: ReadonlyMap<string, KnockoutTeamAward>;
  /** Prediction kinds with a positive scoring rule in this pool. */
  kindsWithPositivePoints: ReadonlySet<string>;
  /** True when all 16 Round of 32 matches are finished with winners. */
  roundOf32FieldComplete: boolean;
};

export type KnockoutPickOutcome =
  | "awarded"
  | "satisfied"
  | "missed"
  | "awaiting"
  | "consistency_error";

const KO_RANK = new Map(
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS.map((kind, index) => [kind, index]),
);

/** Capacity of official `results` rows that mark a stage as filled. */
const OFFICIAL_RESULT_CAPACITY: Record<KnockoutProgressionPredictionKind, number> =
  {
    round_of_32: 16, // R32 winners only (see deriveRoundOf32AdvancementResults)
    round_of_16: 16,
    quarterfinalist: 8,
    semifinalist: 4,
    finalist: 2,
    champion: 1,
  };

export function knockoutProgressionRank(kind: string): number {
  return KO_RANK.get(kind as KnockoutProgressionPredictionKind) ?? -1;
}

export function isAtLeastKnockoutDepth(
  furthest: string | null | undefined,
  required: string,
): boolean {
  if (!furthest) return false;
  const f = knockoutProgressionRank(furthest);
  const r = knockoutProgressionRank(required);
  return f >= 0 && r >= 0 && f >= r;
}

export function betterKnockoutProgressionKind(
  current: string | null,
  candidate: string,
): string {
  if (current == null) return candidate;
  return knockoutProgressionRank(candidate) >= knockoutProgressionRank(current)
    ? candidate
    : current;
}

export type OfficialKnockoutResultRow = {
  kind: string;
  team_id: string | null;
};

export type KnockoutMatchSettlementRow = {
  stage_code: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  winner_team_id: string | null;
  status: string | null;
};

/** Build per-team furthest kind + elimination from official results and matches. */
export function buildKnockoutTeamProgressMap(input: {
  results: readonly OfficialKnockoutResultRow[];
  matches: readonly KnockoutMatchSettlementRow[];
}): {
  progressByTeamId: Map<string, KnockoutTeamProgress>;
  roundOf32FieldComplete: boolean;
} {
  const furthestByTeam = new Map<string, KnockoutProgressionPredictionKind>();
  for (const row of input.results) {
    const teamId = row.team_id?.trim();
    if (!teamId || !isKnockoutProgressionKind(row.kind)) continue;
    const prev = furthestByTeam.get(teamId) ?? null;
    furthestByTeam.set(
      teamId,
      betterKnockoutProgressionKind(prev, row.kind) as KnockoutProgressionPredictionKind,
    );
  }

  const inRoundOf32Field = new Set<string>();
  const eliminated = new Set<string>();
  let finishedR32 = 0;

  for (const match of input.matches) {
    const stage = (match.stage_code ?? "").trim();
    const home = match.home_team_id?.trim() || null;
    const away = match.away_team_id?.trim() || null;
    const winner = match.winner_team_id?.trim() || null;
    const finished =
      (match.status ?? "").trim() === "finished" && Boolean(winner);

    if (stage === "round_of_32") {
      if (home) inRoundOf32Field.add(home);
      if (away) inRoundOf32Field.add(away);
      if (finished) finishedR32 += 1;
    }

    if (!finished || !winner) continue;

    if (home && home !== winner) eliminated.add(home);
    if (away && away !== winner) eliminated.add(away);
  }

  const roundOf32FieldComplete =
    finishedR32 >= 16 && inRoundOf32Field.size >= 32;

  const teamIds = new Set<string>([
    ...furthestByTeam.keys(),
    ...inRoundOf32Field,
    ...eliminated,
  ]);

  const progressByTeamId = new Map<string, KnockoutTeamProgress>();
  for (const teamId of teamIds) {
    const inField = inRoundOf32Field.has(teamId);
    let isEliminated = eliminated.has(teamId);
    // Never appeared in a completed R32 field → cannot progress in knockout.
    if (roundOf32FieldComplete && !inField && !furthestByTeam.has(teamId)) {
      isEliminated = true;
    }
    progressByTeamId.set(teamId, {
      teamId,
      furthestOfficialKind: furthestByTeam.get(teamId) ?? null,
      eliminated: isEliminated,
      inRoundOf32Field: inField,
    });
  }

  return { progressByTeamId, roundOf32FieldComplete };
}

export function countFinishedRoundOf32Matches(
  matches: readonly KnockoutMatchSettlementRow[],
): number {
  let n = 0;
  for (const match of matches) {
    if ((match.stage_code ?? "").trim() !== "round_of_32") continue;
    if (
      (match.status ?? "").trim() === "finished" &&
      match.winner_team_id?.trim()
    ) {
      n += 1;
    }
  }
  return n;
}

export type KnockoutAwardSourcePick = {
  predictionId: string;
  predictionKind: string;
  teamId: string | null;
};

export type KnockoutAwardSourceLedger = {
  predictionId: string | null;
  pointsDelta: number;
  predictionKind: string | null;
};

/**
 * Derive once-per-team awards from already-loaded participant ledger + picks.
 * Prefers the ledger row attached to a knockout pick for that team.
 */
export function buildKnockoutTeamAwardMap(input: {
  picks: readonly KnockoutAwardSourcePick[];
  ledger: readonly KnockoutAwardSourceLedger[];
}): Map<string, KnockoutTeamAward> {
  const teamByPredictionId = new Map<string, string>();
  for (const pick of input.picks) {
    const teamId = pick.teamId?.trim();
    if (!teamId || !isKnockoutProgressionKind(pick.predictionKind)) continue;
    teamByPredictionId.set(pick.predictionId, teamId);
  }

  const awardByTeam = new Map<string, KnockoutTeamAward>();
  for (const row of input.ledger) {
    const predictionId = row.predictionId?.trim();
    if (!predictionId) continue;
    const teamId = teamByPredictionId.get(predictionId);
    if (!teamId) continue;
    const points = Number(row.pointsDelta);
    if (!Number.isFinite(points) || points <= 0) continue;

    const prev = awardByTeam.get(teamId);
    if (!prev || points > prev.points) {
      awardByTeam.set(teamId, {
        teamId,
        representativePredictionId: predictionId,
        points,
        resultKind: row.predictionKind ?? "knockout",
      });
    }
  }

  return awardByTeam;
}

function officialResultCountsByKind(
  results: readonly OfficialKnockoutResultRow[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of results) {
    if (!isKnockoutProgressionKind(row.kind) || !row.team_id?.trim()) continue;
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }
  return counts;
}

function stageResultsComplete(
  kind: KnockoutProgressionPredictionKind,
  counts: ReadonlyMap<string, number>,
): boolean {
  const need = OFFICIAL_RESULT_CAPACITY[kind];
  return (counts.get(kind) ?? 0) >= need;
}

/**
 * True when the predicted depth can no longer be reached by this team.
 */
export function knockoutPickIsImpossible(input: {
  predictionKind: string;
  progress: KnockoutTeamProgress | null | undefined;
  resultCounts: ReadonlyMap<string, number>;
  roundOf32FieldComplete: boolean;
}): boolean {
  const { predictionKind, progress, resultCounts, roundOf32FieldComplete } =
    input;
  if (!isKnockoutProgressionKind(predictionKind)) return false;

  if (
    progress &&
    isAtLeastKnockoutDepth(progress.furthestOfficialKind, predictionKind)
  ) {
    return false;
  }

  if (progress?.eliminated) return true;

  if (
    roundOf32FieldComplete &&
    (!progress || !progress.inRoundOf32Field) &&
    !progress?.furthestOfficialKind
  ) {
    return true;
  }

  if (stageResultsComplete(predictionKind, resultCounts)) {
    return true;
  }

  // Deeper completed stages without this team also settle earlier misses.
  for (const kind of KNOCKOUT_PROGRESSION_PREDICTION_KINDS) {
    if (knockoutProgressionRank(kind) <= knockoutProgressionRank(predictionKind)) {
      continue;
    }
    if (stageResultsComplete(kind, resultCounts)) {
      return true;
    }
  }

  return false;
}

export function resolveKnockoutPickOutcome(input: {
  predictionId: string;
  predictionKind: string;
  teamId: string | null | undefined;
  hasLedgerOnThisPrediction: boolean;
  context: KnockoutProfileSettlementContext;
  resultCounts: ReadonlyMap<string, number>;
}): KnockoutPickOutcome {
  const teamId = input.teamId?.trim() || null;
  if (!teamId || !isKnockoutProgressionKind(input.predictionKind)) {
    return "awaiting";
  }

  if (input.hasLedgerOnThisPrediction) {
    return "awarded";
  }

  const progress = input.context.progressByTeamId.get(teamId);
  const reached = isAtLeastKnockoutDepth(
    progress?.furthestOfficialKind ?? null,
    input.predictionKind,
  );

  if (reached) {
    const award = input.context.awardByTeamId.get(teamId);
    if (award && award.representativePredictionId !== input.predictionId) {
      return "satisfied";
    }
    if (award && award.representativePredictionId === input.predictionId) {
      // Ledger mapping should have caught this; treat as awarded.
      return "awarded";
    }
    const furthest = progress?.furthestOfficialKind;
    if (
      furthest &&
      input.context.kindsWithPositivePoints.has(furthest)
    ) {
      return "consistency_error";
    }
    // Reached a depth with no positive scoring rule (e.g. bare round_of_32).
    return "satisfied";
  }

  if (
    knockoutPickIsImpossible({
      predictionKind: input.predictionKind,
      progress,
      resultCounts: input.resultCounts,
      roundOf32FieldComplete: input.context.roundOf32FieldComplete,
    })
  ) {
    return "missed";
  }

  return "awaiting";
}

export function buildKnockoutResultCounts(
  results: readonly OfficialKnockoutResultRow[],
): Map<string, number> {
  return officialResultCountsByKind(results);
}

/** Assemble settlement context used by profile presentation. */
export function buildKnockoutProfileSettlementContext(input: {
  results: readonly OfficialKnockoutResultRow[];
  matches: readonly KnockoutMatchSettlementRow[];
  picks: readonly KnockoutAwardSourcePick[];
  ledger: readonly KnockoutAwardSourceLedger[];
  kindsWithPositivePoints: ReadonlySet<string> | readonly string[];
}): KnockoutProfileSettlementContext {
  const { progressByTeamId, roundOf32FieldComplete } =
    buildKnockoutTeamProgressMap(input);
  const awardByTeamId = buildKnockoutTeamAwardMap(input);
  const kindsWithPositivePoints =
    input.kindsWithPositivePoints instanceof Set
      ? input.kindsWithPositivePoints
      : new Set(
          [...input.kindsWithPositivePoints].map((k) => String(k).trim()).filter(Boolean),
        );
  return {
    progressByTeamId,
    awardByTeamId,
    kindsWithPositivePoints,
    roundOf32FieldComplete,
  };
}

export function missedKnockoutMeaning(
  predictionKind: string,
  furthest: KnockoutProgressionPredictionKind | null | undefined,
): string {
  const labels: Record<string, string> = {
    round_of_32: "Round of 32",
    round_of_16: "Round of 16",
    quarterfinalist: "quarter-finals",
    semifinalist: "semi-finals",
    finalist: "final",
    champion: "the championship",
  };
  const stage = labels[predictionKind] ?? "this stage";
  if (!furthest) {
    return `Eliminated without reaching ${stage}.`;
  }
  if (predictionKind === "champion") {
    return "Eliminated before becoming champion.";
  }
  if (predictionKind === "finalist") {
    return "Eliminated before reaching the final.";
  }
  return `Eliminated before the ${stage}.`;
}

export function satisfiedKnockoutMeaning(
  teamName: string | null | undefined,
  furthest: KnockoutProgressionPredictionKind | null | undefined,
): string {
  const team = teamName?.trim() || "This team";
  const depthLabels: Record<string, string> = {
    round_of_32: "Round of 32",
    round_of_16: "Round of 16",
    quarterfinalist: "quarter-finals",
    semifinalist: "semi-finals",
    finalist: "the final",
    champion: "champion",
  };
  const depth = furthest ? depthLabels[furthest] : null;
  if (depth) {
    return `${team} reached ${depth}. Knockout points were counted on another pick.`;
  }
  return `${team} reached this stage. Knockout points were counted on another pick.`;
}

export function awardedKnockoutMeaning(
  teamName: string | null | undefined,
): string {
  const team = teamName?.trim() || "This team";
  return `Highest knockout award for ${team}.`;
}

export function awaitingKnockoutMeaning(predictionKind: string): string {
  const labels: Record<string, string> = {
    round_of_32: "Round of 32 progression",
    round_of_16: "Round of 16",
    quarterfinalist: "quarter-finals",
    semifinalist: "semi-finals",
    finalist: "the final",
    champion: "the championship",
  };
  const stage = labels[predictionKind] ?? "this stage";
  return `Still alive — ${stage} not settled for this pick yet.`;
}
