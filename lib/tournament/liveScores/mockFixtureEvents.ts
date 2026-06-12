import { normalizeApiFootballFixtureEvents, type NormalizedFixtureEvents } from "./apiFootballEvents";

/** Deterministic fixture events for mock provider selftests. */
export const MOCK_FIXTURE_EVENT_ROWS: Record<
  string,
  Array<{ team: { name: string }; type: string; detail: string }>
> = {
  "mock-wc2026-g-a-01": [
    { team: { name: "Mexico" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Mexico" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "South Africa" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Mexico" }, type: "Card", detail: "Yellow Card" },
    { team: { name: "South Africa" }, type: "Card", detail: "Yellow Card" },
    { team: { name: "South Africa" }, type: "Card", detail: "Red Card" },
  ],
  "1538999": [
    { team: { name: "Korea Republic" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Korea Republic" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Czechia" }, type: "Goal", detail: "Normal Goal" },
    { team: { name: "Korea Republic" }, type: "Card", detail: "Yellow Card" },
    { team: { name: "Czechia" }, type: "Card", detail: "Yellow Card" },
    { team: { name: "Czechia" }, type: "Card", detail: "Yellow Red Card" },
  ],
};

export function mockNormalizedEventsForFixture(
  fixtureId: string,
  input: {
    homeTeamName: string;
    awayTeamName: string;
    homeFifaCode: string | null;
    awayFifaCode: string | null;
  },
): NormalizedFixtureEvents | null {
  const rows = MOCK_FIXTURE_EVENT_ROWS[fixtureId];
  if (!rows) return null;
  return normalizeApiFootballFixtureEvents(rows, input);
}
