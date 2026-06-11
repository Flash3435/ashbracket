import { createHash } from "node:crypto";
import { teamNamesMatch } from "./normalizeTeamName";
import type {
  ProviderFixtureScore,
  ScoreChangePreview,
  ScoreChangePreviewRow,
  ScoreChangeRowReason,
  TournamentMatchForLiveScores,
} from "./types";

function kickoffDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function scoresEqual(
  aH: number | null,
  aA: number | null,
  aHp: number | null,
  aAp: number | null,
  bH: number | null,
  bA: number | null,
  bHp: number | null,
  bAp: number | null,
): boolean {
  return aH === bH && aA === bA && aHp === bHp && aAp === bAp;
}

type MatchCandidate = {
  match: TournamentMatchForLiveScores;
  fixture: ProviderFixtureScore;
  method: "provider_id" | "date_teams";
};

function teamsMatchFixture(match: TournamentMatchForLiveScores, fixture: ProviderFixtureScore): boolean {
  const homeOk =
    teamNamesMatch(match.homeTeamName, fixture.homeTeamName) ||
    (match.homeFifaCode != null &&
      fixture.homeFifaCode != null &&
      match.homeFifaCode === fixture.homeFifaCode);
  const awayOk =
    teamNamesMatch(match.awayTeamName, fixture.awayTeamName) ||
    (match.awayFifaCode != null &&
      fixture.awayFifaCode != null &&
      match.awayFifaCode === fixture.awayFifaCode);
  return homeOk && awayOk;
}

function findCandidates(
  matches: TournamentMatchForLiveScores[],
  fixtures: ProviderFixtureScore[],
): { candidates: MatchCandidate[]; ambiguousMatchIds: Set<string>; ambiguousFixtureIds: Set<string> } {
  const candidates: MatchCandidate[] = [];
  const ambiguousMatchIds = new Set<string>();
  const ambiguousFixtureIds = new Set<string>();

  const byProviderId = new Map<string, ProviderFixtureScore>();
  for (const f of fixtures) {
    byProviderId.set(f.providerFixtureId, f);
  }

  const unmatchedFixtures = new Set(fixtures.map((f) => f.providerFixtureId));

  for (const match of matches) {
    if (match.providerFixtureId) {
      const fixture = byProviderId.get(match.providerFixtureId);
      if (fixture) {
        candidates.push({ match, fixture, method: "provider_id" });
        unmatchedFixtures.delete(fixture.providerFixtureId);
        continue;
      }
    }
  }

  const matchedByDateTeams = new Map<string, MatchCandidate[]>();

  for (const match of matches) {
    if (candidates.some((c) => c.match.id === match.id)) continue;

    const dateKey = kickoffDateKey(match.kickoffAt);
    for (const fixture of fixtures) {
      if (kickoffDateKey(fixture.kickoffAt) !== dateKey) continue;
      if (!teamsMatchFixture(match, fixture)) continue;
      const key = `${match.id}\0${fixture.providerFixtureId}`;
      const list = matchedByDateTeams.get(key) ?? [];
      list.push({ match, fixture, method: "date_teams" });
      matchedByDateTeams.set(key, list);
    }
  }

  const matchToFixtures = new Map<string, MatchCandidate[]>();
  const fixtureToMatches = new Map<string, MatchCandidate[]>();

  for (const list of matchedByDateTeams.values()) {
    for (const c of list) {
      const ml = matchToFixtures.get(c.match.id) ?? [];
      if (!ml.some((x) => x.fixture.providerFixtureId === c.fixture.providerFixtureId)) {
        ml.push(c);
        matchToFixtures.set(c.match.id, ml);
      }
      const fl = fixtureToMatches.get(c.fixture.providerFixtureId) ?? [];
      if (!fl.some((x) => x.match.id === c.match.id)) {
        fl.push(c);
        fixtureToMatches.set(c.fixture.providerFixtureId, fl);
      }
    }
  }

  for (const [matchId, list] of matchToFixtures) {
    if (list.length > 1) ambiguousMatchIds.add(matchId);
  }
  for (const [fixtureId, list] of fixtureToMatches) {
    if (list.length > 1) {
      ambiguousFixtureIds.add(fixtureId);
      for (const c of list) {
        ambiguousMatchIds.add(c.match.id);
      }
    }
  }

  for (const [matchId, list] of matchToFixtures) {
    if (list.length === 1 && !ambiguousFixtureIds.has(list[0]!.fixture.providerFixtureId)) {
      candidates.push(list[0]!);
      unmatchedFixtures.delete(list[0]!.fixture.providerFixtureId);
    }
  }

  return { candidates, ambiguousMatchIds, ambiguousFixtureIds };
}

function reasonForSkippedMatch(
  match: TournamentMatchForLiveScores,
  ambiguousMatchIds: Set<string>,
): ScoreChangeRowReason {
  if (ambiguousMatchIds.has(match.id)) return "ambiguous";
  return "unmapped";
}

function reasonForFixture(
  fixture: ProviderFixtureScore,
  match: TournamentMatchForLiveScores,
  ambiguousFixtureIds: Set<string>,
): ScoreChangeRowReason {
  if (ambiguousFixtureIds.has(fixture.providerFixtureId)) return "ambiguous";
  if (match.syncLocked) return "sync_locked";
  if (fixture.status === "postponed") return "postponed";
  if (fixture.status === "cancelled") return "cancelled";
  if (fixture.status === "live") return "in_progress";
  if (fixture.status === "scheduled") return "not_finished";
  if (fixture.status !== "finished") return "not_finished";
  if (fixture.homeGoals == null || fixture.awayGoals == null) return "no_score";

  const unchanged = scoresEqual(
    match.homeGoals,
    match.awayGoals,
    match.homePenalties,
    match.awayPenalties,
    fixture.homeGoals,
    fixture.awayGoals,
    fixture.homePenalties,
    fixture.awayPenalties,
  );
  if (unchanged && match.status === "finished") return "unchanged";
  return "will_update";
}

export function buildScoreChangePreview(input: {
  provider: string;
  providerConfigured: boolean;
  configWarning: string | null;
  fetchedAt: string;
  matches: TournamentMatchForLiveScores[];
  fixtures: ProviderFixtureScore[];
}): ScoreChangePreview {
  const { candidates, ambiguousMatchIds, ambiguousFixtureIds } = findCandidates(
    input.matches,
    input.fixtures,
  );

  const candidateByMatchId = new Map(candidates.map((c) => [c.match.id, c]));
  const mappedFixtureIds = new Set(candidates.map((c) => c.fixture.providerFixtureId));

  const rows: ScoreChangePreviewRow[] = [];

  for (const match of input.matches) {
    const candidate = candidateByMatchId.get(match.id);
    if (!candidate) {
      const reason = reasonForSkippedMatch(match, ambiguousMatchIds);
      rows.push({
        matchId: match.id,
        matchCode: match.matchCode,
        providerFixtureId: null,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        currentHomeGoals: match.homeGoals,
        currentAwayGoals: match.awayGoals,
        currentHomePenalties: match.homePenalties,
        currentAwayPenalties: match.awayPenalties,
        fetchedHomeGoals: null,
        fetchedAwayGoals: null,
        fetchedHomePenalties: null,
        fetchedAwayPenalties: null,
        currentStatus: match.status,
        fetchedStatus: null,
        willUpdate: false,
        reason,
        warnings:
          reason === "ambiguous"
            ? ["Multiple provider fixtures match this AshBracket match by date and team names."]
            : reason === "unmapped"
              ? ["No provider fixture mapped to this match."]
              : [],
      });
      continue;
    }

    const { fixture } = candidate;
    const reason = reasonForFixture(fixture, match, ambiguousFixtureIds);
    const warnings: string[] = [];
    if (candidate.method === "date_teams") {
      warnings.push("Matched by kickoff date and team names — consider storing provider_fixture_id.");
    }
    if (fixture.homeFifaCode == null || fixture.awayFifaCode == null) {
      warnings.push("Provider team name could not be mapped to a FIFA code.");
    }

    rows.push({
      matchId: match.id,
      matchCode: match.matchCode,
      providerFixtureId: fixture.providerFixtureId,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      currentHomeGoals: match.homeGoals,
      currentAwayGoals: match.awayGoals,
      currentHomePenalties: match.homePenalties,
      currentAwayPenalties: match.awayPenalties,
      fetchedHomeGoals: fixture.homeGoals,
      fetchedAwayGoals: fixture.awayGoals,
      fetchedHomePenalties: fixture.homePenalties,
      fetchedAwayPenalties: fixture.awayPenalties,
      currentStatus: match.status,
      fetchedStatus: fixture.status,
      willUpdate: reason === "will_update",
      reason,
      warnings,
    });
  }

  const willUpdate = rows.filter((r) => r.willUpdate).length;
  const unchanged = rows.filter((r) => r.reason === "unchanged").length;
  const skipped = rows.length - willUpdate - unchanged;
  const warnings = rows.filter((r) => r.warnings.length > 0).length;
  const unmappedProviderFixtures = input.fixtures.filter(
    (f) => !mappedFixtureIds.has(f.providerFixtureId),
  ).length;

  const updateCodes = rows.filter((r) => r.willUpdate).map((r) => r.matchCode).sort();
  const previewId = createHash("sha256")
    .update([input.fetchedAt, ...updateCodes].join("\0"))
    .digest("hex")
    .slice(0, 16);

  let message: string | null = null;
  const finishedFixtures = input.fixtures.filter((f) => f.status === "finished").length;
  if (input.fixtures.length === 0) {
    message = "Provider returned no fixtures for this competition.";
  } else if (finishedFixtures === 0 && willUpdate === 0) {
    message = "No final matches found from the provider yet.";
  } else if (willUpdate === 0 && finishedFixtures > 0) {
    message = "Final scores are on file — nothing new to apply.";
  }

  return {
    previewId,
    provider: input.provider,
    providerConfigured: input.providerConfigured,
    configWarning: input.configWarning,
    fetchedAt: input.fetchedAt,
    rows,
    summary: {
      matchesChecked: rows.length,
      willUpdate,
      unchanged,
      skipped,
      warnings,
      unmappedProviderFixtures,
    },
    message,
  };
}

export function patchesFromPreviewRows(
  rows: ScoreChangePreviewRow[],
): import("./types").OfficialMatchScorePatchInput[] {
  return rows
    .filter((r) => r.willUpdate)
    .map((r) => ({
      matchCode: r.matchCode,
      homeGoals: r.fetchedHomeGoals!,
      awayGoals: r.fetchedAwayGoals!,
      homePenalties: r.fetchedHomePenalties,
      awayPenalties: r.fetchedAwayPenalties,
      status: "finished" as const,
      providerFixtureId: r.providerFixtureId,
    }));
}
