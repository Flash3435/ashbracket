import type { NormalizedFixtureEvents } from "./apiFootballEvents";
import type { LiveScoresProviderConfig } from "./types";
import { fetchApiFootballFixtureEvents, normalizeApiFootballFixtureEvents } from "./apiFootballEvents";
import { mockNormalizedEventsForFixture } from "./mockFixtureEvents";
import type { ProviderFixtureScore } from "./types";

export type FixtureEventsFetchInput = {
  provider: string;
  config: LiveScoresProviderConfig;
  fixtures: ProviderFixtureScore[];
  fixtureIds: string[];
};

/**
 * Fetch fixture events only for the listed provider fixture ids.
 * Failures are recorded per fixture so score preview still works.
 */
export async function fetchFixtureEventsForPreview(
  input: FixtureEventsFetchInput,
): Promise<{
  eventsByFixtureId: Map<string, NormalizedFixtureEvents | null>;
  fetchFailures: Set<string>;
}> {
  const byId = new Map(input.fixtures.map((f) => [f.providerFixtureId, f]));
  const eventsByFixtureId = new Map<string, NormalizedFixtureEvents | null>();
  const fetchFailures = new Set<string>();

  for (const fixtureId of input.fixtureIds) {
    const fixture = byId.get(fixtureId);
    if (!fixture) {
      eventsByFixtureId.set(fixtureId, null);
      continue;
    }

    if (input.provider === "mock") {
      eventsByFixtureId.set(
        fixtureId,
        mockNormalizedEventsForFixture(fixtureId, {
          homeTeamName: fixture.homeTeamName,
          awayTeamName: fixture.awayTeamName,
          homeFifaCode: fixture.homeFifaCode,
          awayFifaCode: fixture.awayFifaCode,
        }),
      );
      continue;
    }

    if (input.provider !== "api-football") {
      eventsByFixtureId.set(fixtureId, null);
      continue;
    }

    const fetched = await fetchApiFootballFixtureEvents(fixtureId, input.config);
    if (!fetched.ok) {
      eventsByFixtureId.set(fixtureId, null);
      fetchFailures.add(fixtureId);
      continue;
    }

    eventsByFixtureId.set(
      fixtureId,
      normalizeApiFootballFixtureEvents(fetched.events, {
        homeTeamName: fixture.homeTeamName,
        awayTeamName: fixture.awayTeamName,
        homeFifaCode: fixture.homeFifaCode,
        awayFifaCode: fixture.awayFifaCode,
      }),
    );
  }

  return { eventsByFixtureId, fetchFailures };
}

export function fixtureIdsEligibleForEventFetch(
  rows: Array<{ providerFixtureId: string | null; fetchedStatus: import("./types").LiveScoreProviderStatus | null }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.providerFixtureId) continue;
    if (row.fetchedStatus !== "finished") continue;
    ids.add(row.providerFixtureId);
  }
  return [...ids];
}
