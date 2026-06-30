/**
 * Self-test: `npx tsx lib/bracket/posterBracketLayout.selftest.ts`
 */
import {
  connectorShouldHighlight,
  matchHasAliveParticipantPick,
  POSTER_LEFT_HALF,
  POSTER_RIGHT_HALF,
  splitR32Indices,
} from "./posterBracketLayout";
import type { LiveBracketMatch } from "./liveBracketTracker";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function mockMatch(
  overrides: Partial<LiveBracketMatch> & Pick<LiveBracketMatch, "matchKey">,
): LiveBracketMatch {
  const side = (teamId: string | null, pick: LiveBracketMatch["home"]["participantPick"] = null) => ({
    teamId,
    displayName: teamId ?? "TBD",
    countryCode: null,
    tournamentOutcome: null,
    participantPick: pick,
    eliminatedFromTournament: false,
  });

  return {
    fifaMatchNo: 0,
    stageCode: "round_of_32",
    stageLabel: "Round of 32",
    status: "scheduled",
    scoreLine: null,
    statusLabel: null,
    usesOfficialFixture: false,
    participantPickedWinnerId: null,
    home: side(null),
    away: side(null),
    ...overrides,
  };
}

void (async function main() {
  const { left, right } = splitR32Indices();
  assert(left.length === 8, "left R32 has 8 matches");
  assert(right.length === 8, "right R32 has 8 matches");
  assert(left.every((i) => i >= 0 && i < 8), "left R32 indices are first half");
  assert(right.every((i) => i >= 8 && i < 16), "right R32 indices are second half");
  assert(new Set([...left, ...right]).size === 16, "R32 split covers all matches");

  assert(POSTER_LEFT_HALF.r16.length === 4, "left R16 has 4 matches");
  assert(POSTER_RIGHT_HALF.r16.length === 4, "right R16 has 4 matches");
  assert(POSTER_LEFT_HALF.qf.length === 2, "left QF has 2 matches");
  assert(POSTER_RIGHT_HALF.qf.length === 2, "right QF has 2 matches");

  const alive = mockMatch({
    matchKey: "M73",
    home: {
      teamId: "a",
      displayName: "A",
      countryCode: "AAA",
      tournamentOutcome: "pending",
      participantPick: "your_pick_alive",
      eliminatedFromTournament: false,
    },
    away: {
      teamId: "b",
      displayName: "B",
      countryCode: "BBB",
      tournamentOutcome: "pending",
      participantPick: null,
      eliminatedFromTournament: false,
    },
  });
  assert(matchHasAliveParticipantPick(alive), "detects alive participant pick");

  const finished = mockMatch({
    matchKey: "M73",
    home: {
      teamId: "a",
      displayName: "A",
      countryCode: "AAA",
      tournamentOutcome: "advanced",
      participantPick: "your_pick",
      eliminatedFromTournament: false,
    },
    away: {
      teamId: "b",
      displayName: "B",
      countryCode: "BBB",
      tournamentOutcome: "eliminated",
      participantPick: null,
      eliminatedFromTournament: true,
    },
  });
  assert(matchHasAliveParticipantPick(finished), "advanced pick counts as alive");

  const matches = Array.from({ length: 16 }, (_, i) =>
    mockMatch({ matchKey: `M${73 + i}`, fifaMatchNo: 73 + i }),
  );
  matches[0] = alive;
  assert(connectorShouldHighlight(matches, [0, 2]), "connector highlights alive feeder pair");

  console.log("posterBracketLayout.selftest.ts: ok");
})();
