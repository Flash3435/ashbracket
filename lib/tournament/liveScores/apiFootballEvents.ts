import { normalizeNullableText, teamNamesMatch } from "./normalizeTeamName";
import type { LiveScoresProviderConfig } from "./types";

type ApiFootballEventRow = {
  team: { name: string | null };
  type: string | null;
  detail: string | null;
};

type ApiFootballEventsResponse = {
  response?: ApiFootballEventRow[];
  errors?: Record<string, string>;
};

export type NormalizedFixtureEvents = {
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  /** Goal events counted per team — used for mismatch warnings only, not persistence. */
  homeGoalEvents: number;
  awayGoalEvents: number;
  skippedEventTypes: string[];
  warnings: string[];
};

function sideForEventTeam(
  teamName: string,
  homeTeamName: string,
  awayTeamName: string,
  homeFifaCode: string | null,
  awayFifaCode: string | null,
): "home" | "away" | null {
  if (teamNamesMatch(teamName, homeTeamName)) return "home";
  if (teamNamesMatch(teamName, awayTeamName)) return "away";
  if (homeFifaCode && teamNamesMatch(teamName, homeFifaCode)) return "home";
  if (awayFifaCode && teamNamesMatch(teamName, awayFifaCode)) return "away";
  return null;
}

/**
 * Normalize API-Football fixture events into per-team card totals.
 * Yellow-Red Card counts as red only (not yellow) — API treats it as second-yellow dismissal.
 */
export function normalizeApiFootballFixtureEvents(
  events: readonly ApiFootballEventRow[],
  input: {
    homeTeamName: string;
    awayTeamName: string;
    homeFifaCode: string | null;
    awayFifaCode: string | null;
  },
): NormalizedFixtureEvents {
  let homeYellowCards = 0;
  let awayYellowCards = 0;
  let homeRedCards = 0;
  let awayRedCards = 0;
  let homeGoalEvents = 0;
  let awayGoalEvents = 0;
  const skippedEventTypes = new Set<string>();
  const warnings: string[] = [];

  for (const event of events) {
    const teamName = normalizeNullableText(event.team?.name);
    if (!teamName) {
      skippedEventTypes.add("unknown team (missing name)");
      continue;
    }
    const side = sideForEventTeam(
      teamName,
      input.homeTeamName,
      input.awayTeamName,
      input.homeFifaCode,
      input.awayFifaCode,
    );
    if (!side) {
      skippedEventTypes.add(`${normalizeNullableText(event.type)}:${normalizeNullableText(event.detail)} (unknown team)`);
      continue;
    }

    const type = normalizeNullableText(event.type);
    const detail = normalizeNullableText(event.detail);
    if (!type) continue;

    if (type === "Goal") {
      if (side === "home") homeGoalEvents += 1;
      else awayGoalEvents += 1;
      continue;
    }

    if (type !== "Card") {
      skippedEventTypes.add(`${type}:${detail}`);
      continue;
    }

    if (detail === "Yellow Card") {
      if (side === "home") homeYellowCards += 1;
      else awayYellowCards += 1;
    } else if (detail === "Red Card" || detail === "Yellow Red Card") {
      if (side === "home") homeRedCards += 1;
      else awayRedCards += 1;
    } else {
      skippedEventTypes.add(`${type}:${detail}`);
    }
  }

  if (skippedEventTypes.size > 0) {
    warnings.push(`Skipped unknown event types: ${[...skippedEventTypes].slice(0, 5).join(", ")}`);
  }

  return {
    homeYellowCards,
    awayYellowCards,
    homeRedCards,
    awayRedCards,
    homeGoalEvents,
    awayGoalEvents,
    skippedEventTypes: [...skippedEventTypes],
    warnings,
  };
}

export async function fetchApiFootballFixtureEvents(
  fixtureId: string,
  config: LiveScoresProviderConfig,
): Promise<
  | { ok: true; events: ApiFootballEventRow[] }
  | { ok: false; error: string }
> {
  if (!config.apiFootballKey) {
    return { ok: false, error: "API-Football key is not configured." };
  }

  const url = new URL("https://v3.football.api-sports.io/fixtures/events");
  url.searchParams.set("fixture", fixtureId);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "x-apisports-key": config.apiFootballKey },
      next: { revalidate: 0 },
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reach API-Football events.",
    };
  }

  if (!res.ok) {
    return { ok: false, error: `API-Football events returned HTTP ${res.status}.` };
  }

  const body = (await res.json()) as ApiFootballEventsResponse;
  if (body.errors && Object.keys(body.errors).length > 0) {
    return { ok: false, error: Object.values(body.errors).join("; ") };
  }

  return { ok: true, events: body.response ?? [] };
}
