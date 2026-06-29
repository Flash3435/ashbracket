import type { NormalizedFixtureEvents } from "./apiFootballEvents";
import { computeApplyPlanSignature } from "./applyPlanSignature";
import { effectiveDbCardTotals } from "./loadMatchCardStatsForLiveScores";
import { fifaCodeFromTeamName, normalizeNullableText, teamNamesMatch } from "./normalizeTeamName";
import type {
  CardChangeRowReason,
  MatchCardStatsSnapshot,
  ProviderCardPatchInput,
  ProviderFixtureScore,
  ScoreChangePreview,
  ScoreChangePreviewRow,
  ScoreChangeRowReason,
  TournamentMatchForLiveScores,
} from "./types";

function kickoffDateKey(iso: unknown): string | null {
  const text = normalizeNullableText(iso);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

/** Allow adjacent UTC dates — US venue kickoffs often cross midnight UTC. */
function kickoffDatesCompatible(matchIso: unknown, fixtureIso: unknown): boolean {
  const matchKey = kickoffDateKey(matchIso);
  const fixtureKey = kickoffDateKey(fixtureIso);
  if (!matchKey || !fixtureKey) return false;
  if (matchKey === fixtureKey) return true;
  const matchMs = Date.parse(normalizeNullableText(matchIso));
  const fixtureMs = Date.parse(normalizeNullableText(fixtureIso));
  if (!Number.isFinite(matchMs) || !Number.isFinite(fixtureMs)) return false;
  return Math.abs(matchMs - fixtureMs) <= 36 * 60 * 60 * 1000;
}

function fifaCodeForSide(
  code: string | null | undefined,
  name: unknown,
): string | null {
  const fromCode = normalizeNullableText(code);
  if (fromCode) return fromCode.toUpperCase();
  return fifaCodeFromTeamName(name);
}

function sideHasIdentity(
  code: string | null | undefined,
  name: unknown,
): boolean {
  return fifaCodeForSide(code, name) != null || normalizeNullableText(name).length > 0;
}

/** Human-readable reason when a provider fixture cannot participate in team mapping. */
export function describeProviderFixtureIdentityGap(
  fixture: Pick<
    ProviderFixtureScore,
    "providerFixtureId" | "kickoffAt" | "homeTeamName" | "awayTeamName" | "homeFifaCode" | "awayFifaCode"
  >,
): string | null {
  const gaps: string[] = [];
  if (!kickoffDateKey(fixture.kickoffAt)) gaps.push("missing kickoff_at");
  if (!sideHasIdentity(fixture.homeFifaCode, fixture.homeTeamName)) {
    gaps.push("missing home team name/FIFA code");
  }
  if (!sideHasIdentity(fixture.awayFifaCode, fixture.awayTeamName)) {
    gaps.push("missing away team name/FIFA code");
  }
  const pair = sortedFifaPairKey(
    fixture.homeFifaCode,
    fixture.awayFifaCode,
    fixture.homeTeamName,
    fixture.awayTeamName,
  );
  if (!pair && gaps.length === 0) {
    gaps.push("could not resolve FIFA code pair from provider labels");
  }
  if (gaps.length === 0) return null;
  const label = `${fixture.homeTeamName || "?"} vs ${fixture.awayTeamName || "?"}`;
  return `Provider fixture ${fixture.providerFixtureId} (${label}): ${gaps.join("; ")}`;
}

function sortedFifaPairKey(
  homeCode: string | null | undefined,
  awayCode: string | null | undefined,
  homeName: unknown,
  awayName: unknown,
): string | null {
  const home = fifaCodeForSide(homeCode, homeName);
  const away = fifaCodeForSide(awayCode, awayName);
  if (!home || !away) return null;
  return [home, away].sort().join("\0");
}

/** Map provider scores/penalties onto AshBracket home/away when sides match or are reversed. */
export function orientProviderScoresToMatch(
  match: TournamentMatchForLiveScores,
  fixture: ProviderFixtureScore,
): {
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  providerHomeSwapped: boolean;
} | null {
  const dbHome = fifaCodeForSide(match.homeFifaCode, match.homeTeamName);
  const dbAway = fifaCodeForSide(match.awayFifaCode, match.awayTeamName);
  const fxHome = fifaCodeForSide(fixture.homeFifaCode, fixture.homeTeamName);
  const fxAway = fifaCodeForSide(fixture.awayFifaCode, fixture.awayTeamName);
  if (!dbHome || !dbAway || !fxHome || !fxAway) return null;
  if (fixture.homeGoals == null || fixture.awayGoals == null) return null;

  if (fxHome === dbHome && fxAway === dbAway) {
    return {
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      homePenalties: fixture.homePenalties,
      awayPenalties: fixture.awayPenalties,
      providerHomeSwapped: false,
    };
  }
  if (fxHome === dbAway && fxAway === dbHome) {
    return {
      homeGoals: fixture.awayGoals,
      awayGoals: fixture.homeGoals,
      homePenalties: fixture.awayPenalties,
      awayPenalties: fixture.homePenalties,
      providerHomeSwapped: true,
    };
  }
  return null;
}

function orientFixtureEvents(
  match: TournamentMatchForLiveScores,
  fixture: ProviderFixtureScore,
  events: NormalizedFixtureEvents,
): NormalizedFixtureEvents {
  const oriented = orientProviderScoresToMatch(match, fixture);
  if (!oriented?.providerHomeSwapped) return events;
  return {
    ...events,
    homeYellowCards: events.awayYellowCards,
    awayYellowCards: events.homeYellowCards,
    homeRedCards: events.awayRedCards,
    awayRedCards: events.homeRedCards,
    homeGoalEvents: events.awayGoalEvents,
    awayGoalEvents: events.homeGoalEvents,
    warnings: events.warnings,
  };
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

function teamsMatchFixtureDirect(
  match: TournamentMatchForLiveScores,
  fixture: ProviderFixtureScore,
): boolean {
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

function teamsMatchFixture(
  match: TournamentMatchForLiveScores,
  fixture: ProviderFixtureScore,
): boolean {
  if (teamsMatchFixtureDirect(match, fixture)) return true;
  const dbPair = sortedFifaPairKey(
    match.homeFifaCode,
    match.awayFifaCode,
    match.homeTeamName,
    match.awayTeamName,
  );
  const fxPair = sortedFifaPairKey(
    fixture.homeFifaCode,
    fixture.awayFifaCode,
    fixture.homeTeamName,
    fixture.awayTeamName,
  );
  return dbPair != null && dbPair === fxPair;
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
    if (!kickoffDateKey(match.kickoffAt)) continue;

    for (const fixture of fixtures) {
      if (describeProviderFixtureIdentityGap(fixture)) continue;
      if (!kickoffDatesCompatible(match.kickoffAt, fixture.kickoffAt)) continue;
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
  const oriented = orientProviderScoresToMatch(match, fixture);
  if (!oriented) return "no_score";

  const unchanged = scoresEqual(
    match.homeGoals,
    match.awayGoals,
    match.homePenalties,
    match.awayPenalties,
    oriented.homeGoals,
    oriented.awayGoals,
    oriented.homePenalties,
    oriented.awayPenalties,
  );
  if (unchanged && match.status === "finished") return "unchanged";
  return "will_update";
}

function cardsEqual(
  aHy: number | null,
  aAy: number | null,
  aHr: number | null,
  aAr: number | null,
  bHy: number,
  bAy: number,
  bHr: number,
  bAr: number,
): boolean {
  return aHy === bHy && aAy === bAy && aHr === bHr && aAr === bAr;
}

function manualHasAnyCards(snapshot: MatchCardStatsSnapshot | undefined): boolean {
  if (!snapshot?.manual) return false;
  const { home, away } = snapshot.manual;
  return [home.yellowCards, home.redCards, away.yellowCards, away.redCards].some((v) => v != null);
}

function manualDiffersFromFetched(
  snapshot: MatchCardStatsSnapshot | undefined,
  fetched: NormalizedFixtureEvents,
): boolean {
  if (!snapshot?.manual) return false;
  const { home, away } = snapshot.manual;
  const values = [
    [home.yellowCards, fetched.homeYellowCards],
    [away.yellowCards, fetched.awayYellowCards],
    [home.redCards, fetched.homeRedCards],
    [away.redCards, fetched.awayRedCards],
  ] as const;
  return values.some(([manual, provider]) => manual != null && manual !== provider);
}

function cardPlanForMappedRow(input: {
  match: TournamentMatchForLiveScores;
  fixture: ProviderFixtureScore;
  scoreReason: ScoreChangeRowReason;
  ambiguousFixtureIds: Set<string>;
  cardStats?: MatchCardStatsSnapshot;
  events?: NormalizedFixtureEvents | null;
  eventFetchFailed?: boolean;
}): {
  cardReason: CardChangeRowReason;
  cardWillUpdate: boolean;
  fetchedHomeYellowCards: number | null;
  fetchedAwayYellowCards: number | null;
  fetchedHomeRedCards: number | null;
  fetchedAwayRedCards: number | null;
  cardWarnings: string[];
} {
  const db = effectiveDbCardTotals(input.cardStats);
  const cardWarnings: string[] = [];

  if (input.ambiguousFixtureIds.has(input.fixture.providerFixtureId)) {
    return {
      cardReason: "skipped",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  if (input.match.syncLocked) {
    return {
      cardReason: "skipped",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  if (input.fixture.status !== "finished") {
    return {
      cardReason: "skipped",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  if (!input.fixture.providerFixtureId) {
    cardWarnings.push("No provider fixture id — card events were not fetched.");
    return {
      cardReason: "no_event_data",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  if (input.eventFetchFailed) {
    cardWarnings.push("Could not fetch fixture events — card totals unavailable.");
    return {
      cardReason: "no_event_data",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  if (!input.events) {
    cardWarnings.push("No fixture event data returned from provider.");
    return {
      cardReason: "no_event_data",
      cardWillUpdate: false,
      fetchedHomeYellowCards: null,
      fetchedAwayYellowCards: null,
      fetchedHomeRedCards: null,
      fetchedAwayRedCards: null,
      cardWarnings,
    };
  }

  const fetchedRaw = input.events;
  const fetched = orientFixtureEvents(input.match, input.fixture, fetchedRaw);
  const orientedScores = orientProviderScoresToMatch(input.match, input.fixture);
  const fetchedHomeYellowCards = fetched.homeYellowCards;
  const fetchedAwayYellowCards = fetched.awayYellowCards;
  const fetchedHomeRedCards = fetched.homeRedCards;
  const fetchedAwayRedCards = fetched.awayRedCards;

  if (
    orientedScores &&
    (fetched.homeGoalEvents !== orientedScores.homeGoals ||
      fetched.awayGoalEvents !== orientedScores.awayGoals)
  ) {
    cardWarnings.push(
      `Event goal count (${fetched.homeGoalEvents}–${fetched.awayGoalEvents}) differs from final score (${orientedScores.homeGoals}–${orientedScores.awayGoals}).`,
    );
  }

  cardWarnings.push(...fetched.warnings);

  if (manualDiffersFromFetched(input.cardStats, fetched)) {
    cardWarnings.push(
      "Manual card totals differ from provider; keep manual unless forced.",
    );
    return {
      cardReason: "manual_conflict",
      cardWillUpdate: false,
      fetchedHomeYellowCards,
      fetchedAwayYellowCards,
      fetchedHomeRedCards,
      fetchedAwayRedCards,
      cardWarnings,
    };
  }

  if (manualHasAnyCards(input.cardStats)) {
    const manualMatchesFetched = cardsEqual(
      input.cardStats!.manual!.home.yellowCards,
      input.cardStats!.manual!.away.yellowCards,
      input.cardStats!.manual!.home.redCards,
      input.cardStats!.manual!.away.redCards,
      fetchedHomeYellowCards,
      fetchedAwayYellowCards,
      fetchedHomeRedCards,
      fetchedAwayRedCards,
    );
    if (manualMatchesFetched) {
      return {
        cardReason: "unchanged",
        cardWillUpdate: false,
        fetchedHomeYellowCards,
        fetchedAwayYellowCards,
        fetchedHomeRedCards,
        fetchedAwayRedCards,
        cardWarnings,
      };
    }
  }

  const providerSide = input.cardStats?.provider;
  const compareAgainstProvider = providerSide
    ? {
        homeYellow: providerSide.home.yellowCards,
        awayYellow: providerSide.away.yellowCards,
        homeRed: providerSide.home.redCards,
        awayRed: providerSide.away.redCards,
      }
    : db;

  const unchanged = cardsEqual(
    compareAgainstProvider.homeYellow,
    compareAgainstProvider.awayYellow,
    compareAgainstProvider.homeRed,
    compareAgainstProvider.awayRed,
    fetchedHomeYellowCards,
    fetchedAwayYellowCards,
    fetchedHomeRedCards,
    fetchedAwayRedCards,
  );

  if (unchanged && (manualHasAnyCards(input.cardStats) || input.cardStats?.provider)) {
    return {
      cardReason: "unchanged",
      cardWillUpdate: false,
      fetchedHomeYellowCards,
      fetchedAwayYellowCards,
      fetchedHomeRedCards,
      fetchedAwayRedCards,
      cardWarnings,
    };
  }

  if (
    unchanged &&
    !manualHasAnyCards(input.cardStats) &&
    !input.cardStats?.provider
  ) {
    return {
      cardReason: "will_update",
      cardWillUpdate: true,
      fetchedHomeYellowCards,
      fetchedAwayYellowCards,
      fetchedHomeRedCards,
      fetchedAwayRedCards,
      cardWarnings,
    };
  }

  if (unchanged) {
    return {
      cardReason: "unchanged",
      cardWillUpdate: false,
      fetchedHomeYellowCards,
      fetchedAwayYellowCards,
      fetchedHomeRedCards,
      fetchedAwayRedCards,
      cardWarnings,
    };
  }

  return {
    cardReason: "will_update",
    cardWillUpdate: true,
    fetchedHomeYellowCards,
    fetchedAwayYellowCards,
    fetchedHomeRedCards,
    fetchedAwayRedCards,
    cardWarnings,
  };
}

function emptyCardPreviewFields(): Pick<
  ScoreChangePreviewRow,
  | "fetchedHomeYellowCards"
  | "fetchedAwayYellowCards"
  | "fetchedHomeRedCards"
  | "fetchedAwayRedCards"
  | "cardWillUpdate"
  | "cardReason"
> {
  return {
    fetchedHomeYellowCards: null,
    fetchedAwayYellowCards: null,
    fetchedHomeRedCards: null,
    fetchedAwayRedCards: null,
    cardWillUpdate: false,
    cardReason: "unmapped",
  };
}

export function buildScoreChangePreview(input: {
  provider: string;
  providerConfigured: boolean;
  configWarning: string | null;
  fetchedAt: string;
  matches: TournamentMatchForLiveScores[];
  fixtures: ProviderFixtureScore[];
  cardStatsByMatchId?: Map<string, MatchCardStatsSnapshot>;
  eventsByFixtureId?: Map<string, NormalizedFixtureEvents | null>;
  eventFetchFailures?: Set<string>;
}): ScoreChangePreview {
  const { candidates, ambiguousMatchIds, ambiguousFixtureIds } = findCandidates(
    input.matches,
    input.fixtures,
  );

  const fixtureIdentityWarnings = input.fixtures.flatMap((fixture) => {
    const gap = describeProviderFixtureIdentityGap(fixture);
    return gap ? [gap] : [];
  });

  const candidateByMatchId = new Map(candidates.map((c) => [c.match.id, c]));
  const mappedFixtureIds = new Set(candidates.map((c) => c.fixture.providerFixtureId));

  const rows: ScoreChangePreviewRow[] = [];

  for (const match of input.matches) {
    const candidate = candidateByMatchId.get(match.id);
    const cardStats = input.cardStatsByMatchId?.get(match.id);
    const dbCards = effectiveDbCardTotals(cardStats);

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
        currentHomeYellowCards: dbCards.homeYellow,
        currentAwayYellowCards: dbCards.awayYellow,
        currentHomeRedCards: dbCards.homeRed,
        currentAwayRedCards: dbCards.awayRed,
        ...emptyCardPreviewFields(),
        cardReason: reason === "unmapped" ? "unmapped" : "skipped",
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
    const oriented = orientProviderScoresToMatch(match, fixture);
    const warnings: string[] = [];
    if (candidate.method === "date_teams") {
      warnings.push("Matched by kickoff date and team names — consider storing provider_fixture_id.");
    }
    if (oriented?.providerHomeSwapped) {
      warnings.push(
        "Provider home/away are reversed relative to AshBracket — scores oriented by FIFA code.",
      );
    }
    if (fixture.homeFifaCode == null || fixture.awayFifaCode == null) {
      warnings.push("Provider team name could not be mapped to a FIFA code.");
    }

    const events =
      fixture.providerFixtureId && input.eventsByFixtureId
        ? input.eventsByFixtureId.get(fixture.providerFixtureId)
        : undefined;
    const eventFetchFailed =
      fixture.providerFixtureId != null &&
      input.eventFetchFailures?.has(fixture.providerFixtureId) === true;

    const cardPlan = cardPlanForMappedRow({
      match,
      fixture,
      scoreReason: reason,
      ambiguousFixtureIds,
      cardStats,
      events,
      eventFetchFailed,
    });
    warnings.push(...cardPlan.cardWarnings);

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
      fetchedHomeGoals: oriented?.homeGoals ?? null,
      fetchedAwayGoals: oriented?.awayGoals ?? null,
      fetchedHomePenalties: oriented?.homePenalties ?? null,
      fetchedAwayPenalties: oriented?.awayPenalties ?? null,
      currentStatus: match.status,
      fetchedStatus: fixture.status,
      willUpdate: reason === "will_update",
      reason,
      currentHomeYellowCards: dbCards.homeYellow,
      currentAwayYellowCards: dbCards.awayYellow,
      currentHomeRedCards: dbCards.homeRed,
      currentAwayRedCards: dbCards.awayRed,
      fetchedHomeYellowCards: cardPlan.fetchedHomeYellowCards,
      fetchedAwayYellowCards: cardPlan.fetchedAwayYellowCards,
      fetchedHomeRedCards: cardPlan.fetchedHomeRedCards,
      fetchedAwayRedCards: cardPlan.fetchedAwayRedCards,
      cardWillUpdate: cardPlan.cardWillUpdate,
      cardReason: cardPlan.cardReason,
      warnings,
    });
  }

  const willUpdate = rows.filter((r) => r.willUpdate).length;
  const unchanged = rows.filter((r) => r.reason === "unchanged").length;
  const skipped = rows.length - willUpdate - unchanged;
  const warnings = rows.filter((r) => r.warnings.length > 0).length;
  const cardsWillUpdate = rows.filter((r) => r.cardWillUpdate).length;
  const cardsUnchanged = rows.filter((r) => r.cardReason === "unchanged").length;
  const cardsManualConflict = rows.filter((r) => r.cardReason === "manual_conflict").length;
  const cardsNoEventData = rows.filter((r) => r.cardReason === "no_event_data").length;
  const unmappedProviderFixtures = input.fixtures.filter(
    (f) => !mappedFixtureIds.has(f.providerFixtureId),
  ).length;

  const previewId = computeApplyPlanSignature(rows);

  let message: string | null = null;
  const finishedFixtures = input.fixtures.filter((f) => f.status === "finished").length;
  if (input.fixtures.length === 0) {
    message = "Provider returned no fixtures for this competition.";
  } else if (finishedFixtures === 0 && willUpdate === 0 && cardsWillUpdate === 0) {
    message = "No final matches found from the provider yet.";
  } else if (willUpdate === 0 && cardsWillUpdate === 0 && finishedFixtures > 0) {
    message = "Final scores and card totals are on file — nothing new to apply.";
  }

  return {
    previewId,
    provider: input.provider,
    providerConfigured: input.providerConfigured,
    configWarning: input.configWarning,
    fetchedAt: input.fetchedAt,
    rows,
    fixtureIdentityWarnings,
    summary: {
      matchesChecked: rows.length,
      willUpdate,
      unchanged,
      skipped,
      warnings,
      unmappedProviderFixtures,
      fixturesMissingIdentity: fixtureIdentityWarnings.length,
      cardsWillUpdate,
      cardsUnchanged,
      cardsManualConflict,
      cardsNoEventData,
    },
    message,
  };
}

/** @deprecated Use computeApplyPlanSignature — kept for existing selftests. */
export function computePreviewId(rows: ScoreChangePreviewRow[]): string {
  return computeApplyPlanSignature(rows);
}

export { computeApplyPlanSignature } from "./applyPlanSignature";

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

export function cardPatchesFromPreviewRows(
  rows: ScoreChangePreviewRow[],
  editionId: string,
  matches: TournamentMatchForLiveScores[],
): ProviderCardPatchInput[] {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  return rows
    .filter((r) => r.cardWillUpdate)
    .flatMap((r) => {
      const match = matchById.get(r.matchId);
      if (!match?.homeTeamId || !match.awayTeamId) return [];
      if (
        r.fetchedHomeYellowCards == null ||
        r.fetchedAwayYellowCards == null ||
        r.fetchedHomeRedCards == null ||
        r.fetchedAwayRedCards == null
      ) {
        return [];
      }
      return [
        {
          matchId: r.matchId,
          matchCode: r.matchCode,
          editionId,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeYellowCards: r.fetchedHomeYellowCards,
          awayYellowCards: r.fetchedAwayYellowCards,
          homeRedCards: r.fetchedHomeRedCards,
          awayRedCards: r.fetchedAwayRedCards,
        },
      ];
    });
}
