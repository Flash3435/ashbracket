import { fifaCodeFromTeamName, normalizeNullableText } from "./normalizeTeamName";
import type {
  LiveScoresFetchResult,
  LiveScoresProviderConfig,
  LiveScoreProviderStatus,
  ProviderFixtureScore,
} from "./types";

type ApiFootballFixtureResponse = {
  response?: Array<{
    fixture: {
      id: number;
      date: string;
      status: { short: string };
    };
    teams: {
      home: { name: string | null };
      away: { name: string | null };
    };
    goals: { home: number | null; away: number | null };
    score: {
      penalty?: { home: number | null; away: number | null };
    };
  }>;
  errors?: Record<string, string>;
};

export function mapApiFootballStatus(short: string | null | undefined): LiveScoreProviderStatus {
  const s = normalizeNullableText(short).toUpperCase();
  if (!s) return "scheduled";
  if (["NS", "TBD", "SUSP"].includes(s)) return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  if (["PST"].includes(s)) return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(s)) return "cancelled";
  return "scheduled";
}

/** Normalizes one API-Football fixture row (exported for selftests). */
export function normalizeApiFootballFixtureRow(
  row: NonNullable<ApiFootballFixtureResponse["response"]>[number],
): ProviderFixtureScore {
  const homeName = normalizeNullableText(row.teams?.home?.name);
  const awayName = normalizeNullableText(row.teams?.away?.name);
  const status = mapApiFootballStatus(row.fixture.status?.short);
  const pen = row.score?.penalty;

  return {
    providerFixtureId: String(row.fixture.id),
    kickoffAt: normalizeNullableText(row.fixture.date),
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeFifaCode: fifaCodeFromTeamName(homeName),
    awayFifaCode: fifaCodeFromTeamName(awayName),
    homeGoals: row.goals.home,
    awayGoals: row.goals.away,
    homePenalties: pen?.home ?? null,
    awayPenalties: pen?.away ?? null,
    status,
  };
}

export async function fetchApiFootballWorldCupScores(
  config: LiveScoresProviderConfig,
): Promise<LiveScoresFetchResult> {
  if (!config.apiFootballKey || !config.apiFootballLeagueId) {
    return {
      ok: false,
      provider: config.provider,
      error: "API-Football is not fully configured.",
      configWarning: config.configWarning,
    };
  }

  const season = config.apiFootballSeason ?? "2026";
  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("league", config.apiFootballLeagueId);
  url.searchParams.set("season", season);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": config.apiFootballKey,
      },
      next: { revalidate: 0 },
    });
  } catch (e) {
    return {
      ok: false,
      provider: config.provider,
      error: e instanceof Error ? e.message : "Failed to reach API-Football.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      provider: config.provider,
      error: `API-Football returned HTTP ${res.status}.`,
    };
  }

  const body = (await res.json()) as ApiFootballFixtureResponse;
  if (body.errors && Object.keys(body.errors).length > 0) {
    const msg = Object.values(body.errors).join("; ");
    return { ok: false, provider: config.provider, error: msg };
  }

  const fixtures = (body.response ?? []).map(normalizeApiFootballFixtureRow);
  return { ok: true, provider: config.provider, fixtures };
}
