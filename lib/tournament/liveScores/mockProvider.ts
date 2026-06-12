import type { LiveScoresFetchResult, ProviderFixtureScore } from "./types";

/** Deterministic fixtures for selftests and local dev when LIVE_SCORES_PROVIDER=mock. */
export const MOCK_PROVIDER_FIXTURES: ProviderFixtureScore[] = [
  {
    providerFixtureId: "mock-wc2026-g-a-01",
    kickoffAt: "2026-06-11T20:00:00.000Z",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeFifaCode: "MEX",
    awayFifaCode: "RSA",
    homeGoals: 2,
    awayGoals: 1,
    homePenalties: null,
    awayPenalties: null,
    status: "finished",
  },
  {
    providerFixtureId: "mock-wc2026-g-a-02",
    kickoffAt: "2026-06-12T03:00:00.000Z",
    homeTeamName: "Korea Republic",
    awayTeamName: "Czechia",
    homeFifaCode: "KOR",
    awayFifaCode: "CZE",
    homeGoals: null,
    awayGoals: null,
    homePenalties: null,
    awayPenalties: null,
    status: "scheduled",
  },
  {
    providerFixtureId: "mock-wc2026-g-b-01",
    kickoffAt: "2026-06-12T20:00:00.000Z",
    homeTeamName: "Canada",
    awayTeamName: "Bosnia and Herzegovina",
    homeFifaCode: "CAN",
    awayFifaCode: "BIH",
    homeGoals: 1,
    awayGoals: 1,
    homePenalties: null,
    awayPenalties: null,
    status: "live",
  },
];

export async function fetchMockWorldCupScores(): Promise<LiveScoresFetchResult> {
  return { ok: true, provider: "mock", fixtures: MOCK_PROVIDER_FIXTURES };
}
