import {
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS,
  isKnockoutProgressionKind,
} from "@/lib/predictions/knockoutProgressionKinds";

/**
 * Lightweight result row used to detect scoring-input deltas across a sync
 * (before delete+rebuild vs after rebuild).
 */
export type ResultAttributionSnapshot = {
  kind: string;
  teamId: string | null;
  slotKey: string | null;
  groupCode: string | null;
};

export type ThirdPlaceAdvancerSnapshot = {
  settled: boolean;
  /** Sorted unique advancer team ids (empty when unsettled). */
  teamIds: readonly string[];
};

export type MatchAttributionLike = {
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  winnerTeamId: string | null;
  scoringResultKind: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
};

const KO_RANK: ReadonlyMap<string, number> = new Map(
  KNOCKOUT_PROGRESSION_PREDICTION_KINDS.map((kind, index) => [kind, index]),
);

function knockoutRank(kind: string): number {
  return KO_RANK.get(kind) ?? -1;
}

function betterKnockoutKind(current: string | null, candidate: string): string {
  if (current == null) return candidate;
  return knockoutRank(candidate) >= knockoutRank(current) ? candidate : current;
}

/** Furthest knockout progression kind per team from a result snapshot. */
export function buildOfficialFurthestByTeam(
  results: readonly ResultAttributionSnapshot[],
): Map<string, string> {
  const furthest = new Map<string, string>();
  for (const row of results) {
    const teamId = row.teamId?.trim();
    if (!teamId || !isKnockoutProgressionKind(row.kind)) continue;
    furthest.set(teamId, betterKnockoutKind(furthest.get(teamId) ?? null, row.kind));
  }
  return furthest;
}

export function snapshotThirdPlaceAdvancers(
  results: readonly ResultAttributionSnapshot[],
): ThirdPlaceAdvancerSnapshot {
  const teamIds = [
    ...new Set(
      results
        .filter(
          (row) =>
            row.kind === "third_place_qualifier" && Boolean(row.teamId?.trim()),
        )
        .map((row) => row.teamId!.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    settled: teamIds.length >= 8,
    teamIds,
  };
}

/**
 * True only when third-place advancers newly settle or the advancer set changes.
 * Ignore delete/recreate of identical rows (sync always rewrites source='sync').
 */
export function didThirdPlaceQualifiersNewlyScore(
  before: ThirdPlaceAdvancerSnapshot,
  after: ThirdPlaceAdvancerSnapshot,
): boolean {
  if (!after.settled) return false;
  if (!before.settled) return true;
  if (before.teamIds.length !== after.teamIds.length) return true;
  for (let i = 0; i < after.teamIds.length; i++) {
    if (before.teamIds[i] !== after.teamIds[i]) return true;
  }
  return false;
}

function groupAdvancementKey(row: ResultAttributionSnapshot): string | null {
  if (
    (row.kind !== "group_winner" && row.kind !== "group_runner_up") ||
    !row.groupCode ||
    !row.teamId?.trim()
  ) {
    return null;
  }
  return `${row.kind}\0${row.groupCode}\0${row.teamId.trim()}`;
}

function groupAdvancementSet(
  results: readonly ResultAttributionSnapshot[],
): Set<string> {
  const set = new Set<string>();
  for (const row of results) {
    const key = groupAdvancementKey(row);
    if (key) set.add(key);
  }
  return set;
}

function changedGroupCodes(
  before: readonly ResultAttributionSnapshot[],
  after: readonly ResultAttributionSnapshot[],
): string[] {
  const beforeSet = groupAdvancementSet(before);
  const afterSet = groupAdvancementSet(after);
  const groups = new Set<string>();

  for (const key of afterSet) {
    if (!beforeSet.has(key)) {
      const groupCode = key.split("\0")[1];
      if (groupCode) groups.add(groupCode);
    }
  }
  for (const key of beforeSet) {
    if (!afterSet.has(key)) {
      const groupCode = key.split("\0")[1];
      if (groupCode) groups.add(groupCode);
    }
  }

  return [...groups].sort((a, b) => a.localeCompare(b));
}

function isFinishedMatch(match: MatchAttributionLike): boolean {
  return (
    match.homeGoals != null &&
    match.awayGoals != null &&
    Boolean(match.winnerTeamId?.trim())
  );
}

/**
 * Map knockout furthest-stage changes to the finished matches that award those
 * stages. Deterministic: match codes sorted.
 */
export function matchCodesForKnockoutFurthestChanges(input: {
  beforeResults: readonly ResultAttributionSnapshot[];
  afterResults: readonly ResultAttributionSnapshot[];
  matches: readonly MatchAttributionLike[];
}): string[] {
  const beforeFurthest = buildOfficialFurthestByTeam(input.beforeResults);
  const afterFurthest = buildOfficialFurthestByTeam(input.afterResults);
  const codes = new Set<string>();

  const teamIds = new Set([...beforeFurthest.keys(), ...afterFurthest.keys()]);
  for (const teamId of teamIds) {
    const beforeKind = beforeFurthest.get(teamId) ?? null;
    const afterKind = afterFurthest.get(teamId) ?? null;
    if (!afterKind || afterKind === beforeKind) continue;
    if (knockoutRank(afterKind) < 0) continue;

    for (const match of input.matches) {
      if (!isFinishedMatch(match)) continue;
      if (match.winnerTeamId !== teamId) continue;
      if (match.scoringResultKind !== afterKind) continue;
      codes.add(match.matchCode.trim());
    }
  }

  return [...codes].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * When group advancement results change, attribute finished group matches in
 * those groups. Prefer dirty match codes in the group when provided; otherwise
 * include every finished match in the changed group(s).
 */
export function matchCodesForGroupAdvancementChanges(input: {
  beforeResults: readonly ResultAttributionSnapshot[];
  afterResults: readonly ResultAttributionSnapshot[];
  matches: readonly MatchAttributionLike[];
  dirtyMatchCodes?: readonly string[];
}): string[] {
  const groups = changedGroupCodes(input.beforeResults, input.afterResults);
  if (groups.length === 0) return [];

  const dirty = new Set(
    (input.dirtyMatchCodes ?? []).map((code) => code.trim()).filter(Boolean),
  );
  const codes = new Set<string>();

  for (const groupCode of groups) {
    const finishedInGroup = input.matches.filter(
      (match) =>
        match.stageCode === "group" &&
        match.groupCode === groupCode &&
        match.homeGoals != null &&
        match.awayGoals != null,
    );
    const dirtyInGroup = finishedInGroup.filter((match) =>
      dirty.has(match.matchCode.trim()),
    );
    const selected = dirtyInGroup.length > 0 ? dirtyInGroup : finishedInGroup;
    for (const match of selected) {
      codes.add(match.matchCode.trim());
    }
  }

  return [...codes].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve score-impact match attribution for a sync/recompute.
 *
 * - Explicit applied patches always win (preserves live-score / patch workflows).
 * - Otherwise attribute from grounded result deltas (KO furthest changes + group
 *   advancement changes). Never falls back to “latest finished match”.
 */
export function resolveScoreImpactMatchCodes(input: {
  appliedPatchCodes?: readonly string[];
  beforeResults: readonly ResultAttributionSnapshot[];
  afterResults: readonly ResultAttributionSnapshot[];
  matches: readonly MatchAttributionLike[];
  dirtyMatchCodes?: readonly string[];
}): string[] {
  const applied = [
    ...new Set(
      (input.appliedPatchCodes ?? [])
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  if (applied.length > 0) return applied;

  const knockoutCodes = matchCodesForKnockoutFurthestChanges({
    beforeResults: input.beforeResults,
    afterResults: input.afterResults,
    matches: input.matches,
  });
  const groupCodes = matchCodesForGroupAdvancementChanges({
    beforeResults: input.beforeResults,
    afterResults: input.afterResults,
    matches: input.matches,
    dirtyMatchCodes: input.dirtyMatchCodes,
  });

  return [...new Set([...knockoutCodes, ...groupCodes])].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function resolveScoreImpactRunAttribution(input: {
  appliedPatchCodes?: readonly string[];
  beforeResults: readonly ResultAttributionSnapshot[];
  afterResults: readonly ResultAttributionSnapshot[];
  matches: readonly MatchAttributionLike[];
  dirtyMatchCodes?: readonly string[];
}): {
  matchCodes: string[];
  thirdPlaceQualifiersNewlyScored: boolean;
} {
  return {
    matchCodes: resolveScoreImpactMatchCodes(input),
    thirdPlaceQualifiersNewlyScored: didThirdPlaceQualifiersNewlyScore(
      snapshotThirdPlaceAdvancers(input.beforeResults),
      snapshotThirdPlaceAdvancers(input.afterResults),
    ),
  };
}
